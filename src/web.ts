import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';
import { extname } from 'path';

import ejs from 'ejs';
import { register } from 'prom-client';

import { CrcBuffer } from '#/cache/CrcTable.js';
import Environment from '#/util/Environment.js';
import { tryParseInt } from '#/util/TryParse.js';

import { getPublicPerDeploymentToken } from './io/PemUtil.js';

const MIME_TYPES = new Map<string, string>();
MIME_TYPES.set('.js', 'application/javascript');
MIME_TYPES.set('.mjs', 'application/javascript');
MIME_TYPES.set('.css', 'text/css');
MIME_TYPES.set('.html', 'text/html');
MIME_TYPES.set('.wasm', 'application/wasm');
MIME_TYPES.set('.sf2', 'application/octet-stream');

// we don't need/want a full blown website or API on the game server
export const web = http.createServer(async (req, res) => {
    try {
        if (req.method !== 'GET') {
            res.writeHead(405);
            res.end();
            return;
        }

        const url = new URL(req.url ?? '', `http://${req.headers.host}`);

        if (url.pathname.endsWith('.mid')) {
            // todo: packing process should spit out files with crc included in the name
            //   but the server needs to be aware of the crc so it can send the proper length
            //   so that's been pushed off til later...

            // strip _crc from filename, but keep extension
            const filename = url.pathname.substring(1, url.pathname.lastIndexOf('_')) + '.mid';
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/songs/' + filename));
        } else if (url.pathname.startsWith('/crc')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(CrcBuffer.data);
        } else if (url.pathname.startsWith('/title')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/title'));
        } else if (url.pathname.startsWith('/config')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/config'));
        } else if (url.pathname.startsWith('/interface')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/interface'));
        } else if (url.pathname.startsWith('/media')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/media'));
        } else if (url.pathname.startsWith('/models')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/models'));
        } else if (url.pathname.startsWith('/textures')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/textures'));
        } else if (url.pathname.startsWith('/wordenc')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/wordenc'));
        } else if (url.pathname.startsWith('/sounds')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.writeHead(200);
            res.end(await fsp.readFile('data/pack/client/sounds'));
        } else if (url.pathname === '/') {
            if (Environment.WEBSITE_REGISTRATION) {
                res.writeHead(404);
                res.end();
            } else {
                res.writeHead(302, { Location: '/rs2.cgi?lowmem=0&plugin=0' });
                res.end();
            }
        } else if (url.pathname === '/rs2.cgi') {
            // embedded from website.com/client.cgi
            const plugin = tryParseInt(url.searchParams.get('plugin'), 0);
            const lowmem = tryParseInt(url.searchParams.get('lowmem'), 0);

            res.setHeader('Content-Type', 'text/html');
            res.writeHead(200);

            const context = {
                plugin,
                nodeid: Environment.NODE_ID,
                lowmem,
                members: Environment.NODE_MEMBERS,
                portoff: Environment.NODE_PORT - 43594,
                per_deployment_token: ''
            };
            if (Environment.WEB_SOCKET_TOKEN_PROTECTION) {
                context.per_deployment_token = getPublicPerDeploymentToken();
            }

            if (Environment.NODE_DEBUG && plugin == 1) {
                res.end(await ejs.renderFile('view/java.ejs', context));
            } else {
                res.end(await ejs.renderFile('view/client.ejs', context));
            }
        } else if (url.pathname === '/dev.cgi') {
            const lowmem = tryParseInt(url.searchParams.get('lowmem'), 0);

            res.setHeader('Content-Type', 'text/html');
            res.writeHead(200);

            const context = {
                plugin: 0,
                nodeid: 10,
                lowmem,
                members: Environment.NODE_MEMBERS
            };

            res.end(await ejs.renderFile('view/dev.ejs', context));
        } else if (fs.existsSync('public' + url.pathname)) {
            res.setHeader('Content-Type', MIME_TYPES.get(extname(url.pathname ?? '')) ?? 'text/plain');
            res.writeHead(200);
            res.end(await fsp.readFile('public' + url.pathname));
        } else {
            res.writeHead(404);
            res.end();
        }
    } catch (_) {
        res.end();
    }
});

const managementWeb = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);

    if (url.pathname === '/prometheus') {
        res.setHeader('Content-Type', register.contentType);
        res.writeHead(200);
        res.end(await register.metrics());
    } else {
        res.writeHead(404);
        res.end();
    }
});

export function startWeb() {
    web.listen(Environment.WEB_PORT, '20.172.70.1');
}

export function startManagementWeb() {
    managementWeb.listen(Environment.WEB_MANAGEMENT_PORT, '20.172.70.1');
}
