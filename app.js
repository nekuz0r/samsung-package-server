'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var http = require('http');
var AdmZip = require('adm-zip');
var xml = require('xml');
var argv = require('optimist')
    .usage('Usage: $0 --host=[host]')
    .demand(['host'])
    .argv;

var app = express();
app.configure(function () {
    app.set('port', process.env.PORT || 80);
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
});
var httpServer = http.createServer(app, { host: argv.host });

function generateZipPackages (callback) {
    fs.exists('apps', function(exists) {
        if (exists) {
            fs.readdir('apps', function(err, files) {
                if (!err) {
                    var index, zip, buffer;
                    var zips = {};
                    
                    for (index = 0; index < files.length; index++) {
                        if (fs.lstatSync(path.join('apps', files[index])).isDirectory()) {
                            zip = new AdmZip();
                            zip.addLocalFolder(path.join('apps', files[index]), '/');
                            zips[files[index]] = zip.toBuffer();
                        }
                    }
                    
                    return callback(null, zips);
                }
                return callback(err, null);
            });
        }
        return callback(true, null);
    });
}

function generateXmlForPackages (host, zips, callback) {
    var xmlObj = {
        rsp: [
            { _attr: { stat: 'ok' } },
            { list: [] }
        ]
    };
    
    var zipXmlObj;
    for (var key in zips) {
        zipXmlObj = {
            widget: [
                { _attr: { id: key } },
                { title: key },
                { compression: [{ _attr: { size: zips[key].length, type: 'zip' } }] },
                { description: '' },
                { download: 'http://' + host + '/apps/' + key + '.zip' }
            ]
        };
        xmlObj.rsp[1].list.push(zipXmlObj);
    }
    
    callback(null, xml(xmlObj, {
        declaration: {
            version: '1.0',
            encoding: 'UTF-8',
            standalone: 'no'
        }
    }));
}

generateZipPackages(function(err, zips) {
    if (!err) {
        generateXmlForPackages(argv.host, zips, function(err, xml) {
            if (!err) {
                httpServer.listen(app.get('port'), function () {
                    console.log('Samsung Package Server listening on ' + argv.host + ':' + app.get('port'));
                    
                    for (var pkg in zips) {
                        console.log('PKG:', pkg, zips[pkg].length);
                    }
                    
                    app.get('/widgetlist.xml', function(req, res) {
                        res.setHeader('Content-Type', 'application/xml');
                        res.send(200, xml);
                    });
                    
                    app.get('/apps/:pkgname', function(req, res) {
                        var pkgname = path.basename(req.params.pkgname, '.zip');
                        if (zips[pkgname] === undefined) return res.send(404);
                        res.setHeader('Content-Type', 'application/zip');
                        return res.send(200, zips[pkgname]);
                    });
                });
            }
        });
    }
});