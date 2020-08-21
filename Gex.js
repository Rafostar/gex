const { Gio, GLib, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const NAME = 'gex';
const VERSION = '0.0.3';

const TEMP_DIR = GLib.get_tmp_dir() + '/' + NAME;
const GIT_RAW = `https://raw.githubusercontent.com`;

const GEX_OWNER = 'Rafostar';
const GEX_REPO = `${GEX_OWNER}/${NAME}`;
const GEX_JSON = `${NAME}.json`;
const GEX_LATEST = `https://github.com/${GEX_REPO}/releases/latest`;
const GEX_INFO = `\x1B[1;32m${NAME}: \x1B[0m`;

function debug(msg)
{
    let level = 'LEVEL_DEBUG';

    if(msg.constructor === Error) {
        level = 'LEVEL_CRITICAL';
        msg = msg.message;
    }
    GLib.log_structured(
        NAME, GLib.LogLevelFlags[level], {
            MESSAGE: msg,
            SYSLOG_IDENTIFIER: NAME
    });
}

function info(msg)
{
    printerr(GEX_INFO + msg);
}

var Downloader = class
{
    constructor()
    {
        this._filesQueue = 0;
        this._modulesQueue = 0;
        this.modulesList = [];

        this.mainPath = null;
        this.lastSaveDir = null;
        this.hadError = false;
        this.infoPrinted = false;

        this.loop = GLib.MainLoop.new(null, false);
        this.session = new Soup.Session({
            user_agent: NAME,
            timeout: 5,
            use_thread_context: true,
            max_conns_per_host: 4
        });
    }

    get modulesQueue()
    {
        return this._modulesQueue;
    }

    set modulesQueue(value)
    {
        this._modulesQueue = value;
        debug(`modules in queue: ${this.modulesQueue}`);
    }

    set filesQueue(value)
    {
        this._filesQueue = value;
        debug(`files in queue: ${this.filesQueue}`);
    }

    get filesQueue()
    {
        return this._filesQueue;
    }

    run()
    {
        if(!this.mainPath)
            return;

        if(imports.searchPath[0] !== TEMP_DIR) {
            imports.searchPath.unshift(TEMP_DIR);
            debug(`added ${NAME} dir to search path: ${TEMP_DIR}`);
        }

        let path = this.mainPath.substring(0, this.mainPath.indexOf('.js'));
        debug(`importing: ${this.mainPath}`);
        path = path.split('/');

        let mainImport = imports;
        for(let subPath of path) {
            if(mainImport[subPath])
                mainImport = mainImport[subPath];
        }

        debug(`successfully imported: ${this.mainPath}`);
        if(!mainImport.main || typeof mainImport.main !== 'function')
            return debug('module does not have main function');

        debug('starting main function...');
        mainImport.main();
    }

    downloadModule(opts)
    {
        if(opts.repo && !opts.repo.includes('/'))
            opts.repo = `${GEX_OWNER}/opts.repo`;

        this._downloadModule(opts)
            .catch(err => this._onUnrecoverableError(err));

        this.loop.run();

        return !this.hadError;
    }

    updateCheck()
    {
        this._updateCheck();
        this.loop.run();
    }

    async _downloadModule(opts)
    {
        let defaults = {
            name: null,
            repo: null,
            src: null,
            version: 'master',
            isDependency: true
        };

        opts = Object.assign(defaults, opts);
        if(opts.repo) {
            opts.repo = opts.repo.toLowerCase();
        }
        if(!opts.name) {
            opts.name === opts.repo.substing(opts.repo.indexOf('/') + 1);
        }
        if(opts.version !== 'master' && opts.version.length > 7) {
            opts.version = opts.version.substring(0, 7);
        }

        let gexjson;
        let modulePath = `${opts.repo}/${opts.version}`;

        if(this.modulesList.includes(modulePath))
            return debug(`skipping already added module: ${modulePath}`);

        debug(`requested "${opts.name}" module from: ${modulePath}`);
        this.modulesQueue++;

        this.modulesList.push(modulePath);
        let importDir = `${TEMP_DIR}/${modulePath}`;
        let downloadDir = `${importDir}/${opts.name}`;
        let savePath = `${downloadDir}/${GEX_JSON}`;
        let downloadSrc = (opts.src)
            ? opts.src
            : `${GIT_RAW}/${opts.repo}/${opts.version}`;

        let gioFile = Gio.file_new_for_path(`${importDir}/${GEX_JSON}`);
        if(gioFile.query_exists(null)) {
            debug(`found downloaded "${GEX_JSON}" for "${opts.name}" module`);
            gexjson = await this._readFile(gioFile, true).catch(debug);
        }
        if(!gexjson) {
            gexjson = await this._download({
                link: `${downloadSrc}/${GEX_JSON}`,
                parseJSON: true
            }).catch(debug);

            if(gexjson) {
                this._makeDirForFile(`${importDir}/${GEX_JSON}`);
                await this._saveFile(gexjson, gioFile, true)
                    .catch(err => this._onUnrecoverableError(err));
            }
        }

        if(!gexjson)
            throw new Error(`could not obtain "${GEX_JSON}" for "${opts.name}" module`);

        debug(`successfully obtained "${GEX_JSON}" for "${opts.name}" module`);

        if(Array.isArray(gexjson)) {
            gexjson = (opts.name)
                ? gexjson.find(module => module.name === opts.name)
                : gexjson[0];
        }
        if(typeof gexjson !== 'object')
            throw new Error(`module "${opts.name}" not found in "${GEX_JSON}"`);

        if(!opts.isDependency && !this.mainPath) {
            if(!gexjson.main)
                throw new Error(`module "${opts.name}" is not a runnable app`);
            else
                this.mainPath = `${modulePath}/${gexjson.name}/${gexjson.main}`;
        }

        let importsToEdit = {};

        if(gexjson.dependencies) {
            let dependencies = gexjson.dependencies;
            for(let dep in dependencies) {
                let dependency = dependencies[dep];
                let version = dependency.version || 'master';
                if(dependency.repo)
                    dependency.repo = dependency.repo.toLowerCase();

                let depPath = `${dependency.repo}/${version}`;
                importsToEdit[dep] = depPath;
                let src = (dependency.repo)
                    ? `${GIT_RAW}/${depPath}`
                    : null;

                if(!src) {
                    throw new Error(
                        `dependency "${dep}" of module "${opts.name}" is missing a source`
                    );
                }
                this._downloadModule({
                    name: dep,
                    src: src,
                    repo: dependency.repo,
                    version: version
                }).catch(err => this._onUnrecoverableError(err));
            }
        }
        importsToEdit[gexjson.name] = `${opts.repo}/${opts.version}`;
        if(gexjson.files) {
            for(let file of gexjson.files) {
                savePath = `${downloadDir}/${file}`;
                this._download({
                    link: `${downloadSrc}/${file}`,
                    savePath: savePath,
                    importsToEdit
                }).catch(err => this._onUnrecoverableError(err));
            }
        }
        if(gexjson.main) {
            savePath = `${downloadDir}/${gexjson.main}`;
            this._download({
                link: `${downloadSrc}/${gexjson.main}`,
                savePath: savePath,
                importsToEdit
            }).catch(err => this._onUnrecoverableError(err));
        }

        this.modulesQueue--;
    }

    async _download(opts)
    {
        this.filesQueue++;

        let retries = 3;
        let stop = false;

        while(retries-- && !stop) {
            let data = await this._tryDownload(opts).catch(res => {
                if(Array.isArray(res)) {
                    /* res[0] = error, res[1] = stop */
                    debug(res[0]);
                    stop = res[1];
                }
                else {
                    /* other unpredicted exception */
                    debug(res);
                    stop = true;
                }
            });
            if(data) {
                this.filesQueue--;
                this._onAsyncDownloadCompleted();

                return data;
            }
        }
        let errMsg = (stop)
            ? 'download failed'
            : 'download retries exceeded';

        this.loop.quit();
        throw new Error(errMsg);
    }

    _tryDownload(opts)
    {
        let optsType = (typeof opts);

        let defaults = {
            link: (optsType === 'string') ? opts : null,
            savePath: null,
            parseJSON: false
        };

        if(optsType !== 'object')
            optsType = {};

        opts = Object.assign(defaults, opts);

        return new Promise((resolve, reject) => {
            let file;
            let data = '';

            if(!opts.link)
                return reject([new Error('missing download link'), true]);

            if(opts.savePath) {
                debug(`verifying: ${opts.savePath}`);
                file = Gio.file_new_for_path(opts.savePath);
                if(file.query_exists(null)) {
                    debug(`file exists: ${opts.savePath}`);
                    if(!opts.parseJSON)
                        return resolve(true);

                    this._readFile(file, true)
                        .then(json => resolve(json))
                        .catch(err => reject([err, true]));
                    return;
                }
                debug(`file is missing: ${opts.savePath}`);
                this._makeDirForFile(opts.savePath);
            }

            if(!this.infoPrinted) {
                info('downloading modules...');
                this.infoPrinted = true;
            }

            let message = Soup.Message.new('GET', opts.link);
            let isJsFile = (
                !opts.parseJSON
                && opts.savePath
                && opts.savePath.endsWith('.js')
            );
            debug('downloading: ' + opts.link);

            message.connect('got_chunk', (self, chunk) => {
                debug('Got chunk of: ' + opts.link);
                let chunkData = chunk.get_data();
                if(isJsFile || opts.parseJSON) {
                    data += (chunkData instanceof Uint8Array)
                        ? ByteArray.toString(chunkData)
                        : chunkData;
                }
            });

            this.session.queue_message(message, () => {
                let json = null;
                let err;

                if(message.status_code !== 200) {
                    return reject([
                        new Error(`response code: ${message.status_code}`),
                        (message.status_code === 404)
                    ]);
                }
                debug('downloaded: ' + opts.link);
                if(isJsFile) {
                    data = this._editImports(opts.importsToEdit, data);
                    this._saveFile(data, file)
                        .then(() => resolve(true))
                        .catch(err => reject(err));
                    return;
                }
                else {
                    try { json = JSON.parse(data); }
                    catch(e) { err = e; }

                    if(err)
                        return reject([err, true]);
                }
                resolve(json);
            });
        });
    }

    _editImports(importsToEdit, data)
    {
        for(let imp in importsToEdit) {
            let oldImport = 'imports\\.' + imp;
            let reg = new RegExp(oldImport, 'g');
            let newImport = importsToEdit[imp].replace(/\//g, '\'][\'');
            newImport = 'imports[\'' + newImport + '\'].' + imp;

            debug(`replacing "${oldImport}" -> "${newImport}"`);
            data = data.replace(reg, newImport);
        }

        return data;
    }

    async _updateCheck()
    {
        let version = await this._findUpdate().catch(debug);
        this.loop.quit();

        if(version)
            info(`found update: ${VERSION} -> ${version}`);
    }

    _findUpdate()
    {
        debug(`checking for ${NAME} update...`);
        return new Promise((resolve, reject) => {
            let request = this.session.request_http('GET', GEX_LATEST);
            request.send_async(null, () => {
                let message = request.get_message();
                if(!message || message.status_code !== 200)
                    return reject(new Error('update check failed'));

                let uri = message.get_uri().to_string(true);
                let version = uri.substring(uri.lastIndexOf('/') + 1);

                if(!version || version.length !== VERSION.length) {
                    debug('update version mismatch');
                    return resolve(null);
                }

                if(version === VERSION) {
                    debug('no new update');
                    return resolve(null);
                }

                resolve(version);
            });
        });
    }

    _makeDirForFile(filePath)
    {
        let saveDir = GLib.path_get_dirname(filePath);
        if(saveDir === this.lastSaveDir)
            return debug('directory created earlier');

        debug(`checking dir: ${saveDir}`);
        let file = Gio.file_new_for_path(saveDir);
        if(file.query_exists(null))
            return debug('dir exists');

        debug('directory does not exist');
        file.make_directory_with_parents(null);
        this.lastSaveDir = saveDir;
        debug(`directory created`);
    }

    _readFile(gioFile, isJSON)
    {
        return new Promise((resolve, reject) => {
            let filePath = gioFile.get_path();
            debug(`loading file: ${filePath}`);
            gioFile.load_contents_async(null, (self, task) => {
                this._onReadFileCompleted(self, task, isJSON, (data) => {
                    if(!data)
                        return reject(new Error(`could not load file: ${filePath}`));

                    debug(`loaded file: ${filePath}`);
                    resolve(data);
                });
            });
        });
    }

    _onReadFileCompleted(gioFile, task, isJSON, cb)
    {
        let json = null;
        let [res, contents] = gioFile.load_contents_finish(task);

        if(res && contents) {
            if(isJSON) {
                if(contents instanceof Uint8Array)
                    contents = ByteArray.toString(contents);

                try { json = JSON.parse(contents); }
                catch(e) { debug(e); }
            }
            else {
                json = String(contents);
            }
        }

        if(contents)
            GLib.free(contents);

        cb(json);
    }

    _saveFile(contents, gioFile, isJSON)
    {
        return new Promise((resolve, reject) => {
            let filePath = gioFile.get_path();
            debug(`saving file: ${filePath}`);
            if(isJSON)
                contents = JSON.stringify(contents, null, 2);

            gioFile.replace_contents_bytes_async(
                GLib.Bytes.new_take(contents),
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null,
                (self, task) => this._onSaveFileCompleted(self, task, (res) => {
                    if(!res)
                        return reject(new Error(`could not save file: ${filePath}`));

                    debug(`saved file: ${filePath}`);
                    resolve();
                })
            );
        });
    }

    _onSaveFileCompleted(gioFile, task, cb)
    {
        let [res, etag] = gioFile.replace_contents_finish(task);

        if(etag)
            GLib.free(etag);

        cb(res);
    }

    _onAsyncDownloadCompleted()
    {
        if(this.modulesQueue || this.filesQueue)
            return;

        if(this.infoPrinted) {
            info('download complete');
            this.infoPrinted = true;
        }

        debug('all downloads completed');
        this.loop.quit();
    }

    _onUnrecoverableError(err)
    {
        debug(err, true);
        this.hadError = true;
        this.loop.quit();
    }
}
