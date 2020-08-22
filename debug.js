const { GLib } = imports.gi;

const NAME = 'gex';
const GEX_INFO = `\x1B[1;32m${NAME}: \x1B[0m`;

function debug(msg)
{
    let level = 'LEVEL_DEBUG';

    if(msg instanceof Error) {
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
