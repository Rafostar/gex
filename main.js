const { Gex } = imports.gex;

function main()
{
    let repo = (ARGV.length)
        ? ARGV[0].toLowerCase()
        : null;

    let name = (ARGV.length > 1)
        ? ARGV[1]
        : null;

    let version = 'master';

    let gex = new Gex.Downloader();

    gex.downloadModule({
        name: name,
        repo: repo,
        version: version,
        isDependency: false
    });
}
