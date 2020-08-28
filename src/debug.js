const { GLib } = imports.gi;

const GEX_INFO = `\x1B[1;32m${pkg.name}: \x1B[0m`;
const UPDATE_INFO = `\x1B[1;93m${pkg.name}-updater: \x1B[0m`;
var quiet = false;

function debug(msg)
{
    let level = 'LEVEL_DEBUG';

    if(msg instanceof Error) {
        level = 'LEVEL_CRITICAL';
        msg = msg.message;

    }
    GLib.log_structured(
        pkg.name, GLib.LogLevelFlags[level], {
            MESSAGE: msg,
            SYSLOG_IDENTIFIER: pkg.name
    });
}

function info(msg, type)
{
    if(quiet)
        return;

    let inf;
    switch(type) {
        case 'update':
            inf = UPDATE_INFO;
            break;
        default:
            inf = GEX_INFO;
            break;
    }

    printerr(inf + msg);
}

function infoUpdate(msg)
{
    info(msg, 'update');
}
