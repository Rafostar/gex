const { GLib } = imports.gi;
const About = imports.gex.about;

const GEX_INFO = `\x1B[1;32m${About.name}: \x1B[0m`;

var quiet = false;

function debug(msg)
{
    let level = 'LEVEL_DEBUG';

    if(msg instanceof Error) {
        level = 'LEVEL_CRITICAL';
        msg = msg.message;

    }
    GLib.log_structured(
        About.name, GLib.LogLevelFlags[level], {
            MESSAGE: msg,
            SYSLOG_IDENTIFIER: About.name
    });
}

function info(msg)
{
    if(quiet)
        return;

    printerr(GEX_INFO + msg);
}
