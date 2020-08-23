const Debug = imports.src.debug;

let { info } = Debug;

function parseArgs(args)
{
    if(!args.length)
        return null;

    let opts = {};

    for(let arg of args) {
        let isOption = (arg.startsWith('-'));

        if(!isOption) {
            if(!opts.repo) {
                [opts.repo, opts.version] = _parseRepo(arg);
                if(opts.repo)
                    continue;

                return null;
            }
            if(opts.name || arg.includes('/'))
                return null;

            opts.name = arg;
            continue;
        }

        switch(arg) {
            case '-q':
            case '--quiet':
                opts.quiet = true;
                break;
            case '-nr':
            case '--no-run':
                opts.noRun = true;
                break;
            case '-v':
            case '--version':
                opts.showVersion = true;
                return opts;
            case '-h':
            case '--help':
                opts.showHelp = true;
                return opts;
            default:
                opts.invalidArg = arg;
                return opts;
        }
    }

    return opts;
}

function showHelp()
{
    let nameUpper = pkg.name[0].toUpperCase() + pkg.name.slice(1);

    let help = [
        `${nameUpper} ${pkg.version}, download and run GJS modules from GIT.`,
        ``,
        `Usage:`,
        `  ${pkg.name} <REPO_OWNER/REPO_NAME[/VERSION]> [MODULE_NAME]`,
        ``,
        `Options:`,
        `  -h,  --help            show this help screen`,
        `  -nr, --no-run          do not run module (download only)`,
        `  -q,  --quiet           no standard output (errors only)`,
        `  -v,  --version         show current version`,
    ].join('\n');

    print(help);
}

function showVersion()
{
    print(pkg.version);
}

function showInvalid(option)
{
    let invalid = [
        `unrecognized option '${option}',`,
        `launch without any args to get help`,
    ].join(' ');

    info(invalid);
}

function getShortcut(opts)
{
    let shortcut = [
        `[Desktop Entry]`,
        `Type=Application`,
        `Name=${opts.name}`,
        `Icon=${opts.icon || 'system-software-install'}`,
        `Exec=${pkg.name} ${opts.exec}`,
        `Terminal=${opts.terminal}`,
    ].join('\n');

    return shortcut;
}

function _parseRepo(repo)
{
    let result = ['', null];
    repo = repo.split('/');

    switch(repo.length) {
        case 3:
            if(repo[2].length)
                result[1] = repo[2];
        case 2:
            result[0] = repo[0];
            result[0] += '/' + repo[1];
            break;
        case 1:
            result[0] = repo[0];
            break;
        default:
            break;
    }

    if(result[0].length < 2)
        result[0] = null;

    return result;
}
