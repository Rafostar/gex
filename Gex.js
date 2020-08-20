const { Gio, GLib, Soup } = imports.gi;
const ByteArray = imports.byteArray;

const NAME = 'gex';
const VERSION = '0.0.1';

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
        this.activeDownloads = 0;
        this.mainPath = null;
        this.lastSaveDir = null;
        this.hadError = false;
        this.infoPrinted = false;

        this.loop = GLib.MainLoop.new(null, false);
        this.session = new Soup.Session({
            user_agent: NAME,
            timeout: 5,
            use_thread_context: true,
            max_conns_per_host: 3
        });
    }

    updateCheck()
    {
        this._updateCheck();
        this.loop.run();
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
        let importDir = `${TEMP_DIR}/${opts.repo}/${opts.version}`;
        let downloadDir = `${importDir}/${opts.name}`;
        let savePath = `${downloadDir}/${GEX_JSON}`;
        let downloadSrc = (opts.src)
            ? opts.src
            : `${GIT_RAW}/${opts.repo}/${opts.version}`;

        let gioFile = Gio.file_new_for_path(`${importDir}/${GEX_JSON}`);
        if(gioFile.query_exists(null)) {
            debug(`found downloaded ${GEX_JSON} for "${opts.name}" module`);
            gexjson = this._readFileJSON(gioFile);
        }
        if(!gexjson) {
            gexjson = await this._download({
                link: `${downloadSrc}/${GEX_JSON}`,
                parseJSON: true
            }).catch(debug);

            if(gexjson) {
                this._makeDirForFile(`${importDir}/${GEX_JSON}`);
                this._saveFileJSON(gexjson, gioFile);
            }
        }

        if(!gexjson)
            throw new Error(`could not obtain ${GEX_JSON}`);

        debug(`successfully obtained ${GEX_JSON}`);

        if(Array.isArray(gexjson)) {
            gexjson = (opts.name)
                ? gexjson.find(module => module.name === opts.name)
                : gexjson[0];
        }
        if(typeof gexjson !== 'object')
            throw new Error(`module "${opts.name}" not found in ${GEX_JSON}`);

        if(!opts.isDependency && !this.mainPath) {
            if(!gexjson.main)
                throw new Error(`module "${opts.name}" is not a runnable app`);
            else
                this.mainPath = `${gexjson.name}/${gexjson.main}`;
        }
        if(gexjson.files) {
            for(let file of gexjson.files) {
                savePath = `${downloadDir}/${file}`;
                this._download({
                    link: `${downloadSrc}/${file}`,
                    savePath: savePath,
                    isAsyncDownload: true
                }).catch(debug);
            }
        }
        if(gexjson.main) {
            savePath = `${downloadDir}/${gexjson.main}`;
            this._download({
                link: `${downloadSrc}/${gexjson.main}`,
                savePath: savePath,
                isAsyncDownload: true
            }).catch(debug);
        }
        if(gexjson.dependencies) {
            let dependencies = gexjson.dependencies;
            for(let dep in dependencies) {
                let dependency = dependencies[dep];
                let version = dependency.version || 'master';
                let src = (dependency.repo)
                    ? `${GIT_RAW}/${dependency.repo}/${version}`
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
        if(!imports.searchPath.includes(importDir)) {
            imports.searchPath.unshift(importDir);
            debug(`added dir to search path: ${importDir}`);
        }
    }

    async _download(opts)
    {
        this.activeDownloads++;

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
                this.activeDownloads--;

                if(opts.isAsyncDownload)
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
            let file, fstream;
            let data = '';

            if(!opts.link)
                return reject([new Error('missing download link'), true]);

            if(opts.savePath) {
                debug(`verifying: ${opts.savePath}`);
                file = Gio.file_new_for_path(opts.savePath);
                if(file.query_exists(null)) {
                    debug(`file exists`);
                    if(!opts.parseJSON)
                        return resolve(true);

                    let parsed = this._readFileJSON(file);
                    if(parsed)
                        return resolve(parsed);
                }
                debug(`file is missing`);
                this._makeDirForFile(opts.savePath);
                fstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            }

            if(!this.infoPrinted) {
                info('downloading modules...');
                this.infoPrinted = true;
            }

            let message = Soup.Message.new('GET', opts.link);
            debug('downloading: ' + opts.link);

            message.connect('got_chunk', (self, chunk) => {
                debug('Got chunk of: ' + opts.link);
                let chunkData = chunk.get_data();
                if(opts.savePath)
                    fstream.write(chunkData, null);
                if(!opts.savePath || opts.parseJSON)
                    data += ByteArray.toString(chunkData);
            });

            this.session.queue_message(message, () => {
                let json = null;
                let err;
                if(opts.savePath) {
                    fstream.close(null);
                }
                if(message.status_code !== 200) {
                    return reject([
                        new Error(`response code: ${message.status_code}`),
                        (message.status_code === 404)
                    ]);
                }
                debug('downloaded: ' + opts.link);
                if(opts.savePath && !opts.parseJSON) {
                    return resolve(true);
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

    _run()
    {
        if(!this.mainPath)
            return;

        debug(`importing: ${this.mainPath}`);
        let path = this.mainPath.substring(0, this.mainPath.indexOf('.js'));
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

    _makeDirForFile(filePath)
    {
        let saveDir = filePath.slice(0, filePath.lastIndexOf('/'));
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

    _readFileJSON(gioFile)
    {
        let json = null;
        let [res, data] = gioFile.load_contents(null);
        if(!res)
            return null;

        try { json = JSON.parse(ByteArray.toString(data)); }
        catch(e) { debug(e); }

        GLib.free(data);

        return json;
    }

    _saveFileJSON(contents, gioFile)
    {
        debug('saving file contents...');
        gioFile.replace_contents(
            JSON.stringify(contents, null, 2),
            null,
            false,
            Gio.FileCreateFlags.NONE,
            null
        );
        debug('file saved');
    }

    _onAsyncDownloadCompleted()
    {
        if(this.activeDownloads)
            return;

        if(this.infoPrinted) {
            info('download complete');
            this.infoPrinted = true;
        }

        debug('all downloads for module completed');
        this.loop.quit();
        this._run();
    }

    _onUnrecoverableError(err)
    {
        debug(err, true);
        this.hadError = true;
        this.loop.quit();
    }
}
