pkg.version = '0.1.2';

const Gex = imports.src.gex;
const Helper = imports.src.helper;
const Debug = imports.src.debug;

let { info } = Debug;

function main()
{
    let opts = Helper.parseArgs(ARGV);

    if(!opts || opts.showHelp)
        return Helper.showHelp();
    if(opts.showVersion)
        return Helper.showVersion();
    if(opts.invalidArg)
        return Helper.showInvalid(opts.invalidArg);
    if(opts.quiet)
        Debug.quiet = true;

    let gex = new Gex.Downloader();
    opts.isDependency = false;
    gex.downloadModule(opts);

    if(gex.hadError)
        return info('encountered an error');

    if(opts.noRun)
        return info('module is ready');

    gex.run();
}
