const { Gex } = imports.gex;
const Helper = imports.gex.helper;
const Debug = imports.gex.debug;

let { info } = Debug;

function main()
{
    let opts = Helper.parseArgs(ARGV);
    if(!opts)
        return info('invalid arguments');

    let gex = new Gex.Downloader();
    opts.isDependency = false;

    gex.downloadModule(opts);

    if(gex.hadError)
        return info('encountered an error');

    gex.run();
}
