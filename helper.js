function parseArgs(args)
{
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
        }
    }

    return opts;
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
