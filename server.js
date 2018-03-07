import restify from 'restify';


let title = "";
title += "               _             __            _" + "\n";
title += " _ __ __ _ ___| |_ ___ _ __ \/ _| __ _ _ __(_)" + "\n";
title += "| '__\/ _` \/ __| __\/ _ \ '__| |_ \/ _` | '__| |" + "\n";
title += "| | | (_| \__ \ ||  __\/ |  |  _| (_| | |  | |" + "\n";
title += "|_|  \__,_|___\/\__\___|_|  |_|  \__,_|_|  |_|" + "\n";



//var restify = require('restify');
var execSync = require('child_process').execSync;
var execAsync = require('child_process').exec;
var async = require('async');
var extConf = require('./config.json');

var fs = require('fs');
if (extConf.customExtensions !== undefined) {
    var customExtensions = require(extConf.customExtensions);
    // console.log("custom extensions loaded from " + configuration.custom);
} else {
    //console.log("no custom extensions loaded");
}


let defaults = {
    "port": 8081,
    "host": "0.0.0.0",
    "workers": 1,
    "tmpFolder": "./tmp/",
    "keepFilesForDebugging": false,
    "speechComments": false,
    "tolerantMode": false,
    "sourceSRS": "EPSG:25832",
    "nodata_color": "249 249 249",
    "interpolation": "average"
};

var conf = {
    "port": extConf.port || defaults.port,
    "host": extConf.host || defaults.host,
    "workers": extConf.workers || defaults.workers,
    "tmpFolder": extConf.tmpFolder || defaults.tmpFolder,
    "keepFilesForDebugging": extConf.keepFilesForDebugging || defaults.keepFilesForDebugging,
    "speechComments": extConf.speechComments || defaults.speechComments,
    "sourceSRS": extConf.sourceSRS || defaults.sourceSRS,
    "tolerantMode": extConf.tolerantMode || defaults.tolerantMode,
    "nodata_color": extConf.nodata_color || defaults.nodata_color,
    "interpolation": extConf.interpolation || defaults.interpolation
};

if (!fs.existsSync(conf.tmpFolder)) {
    fs.mkdirSync(conf.tmpFolder);
}

function log(message, nonce) {
    fs.appendFile(conf.tmpFolder + "processing_of_" + nonce + ".log", message + '\n',(error)=>{
        if (error) {
            console.log("Problem during log write");
        }
    });
    console.log(nonce+":"+message);
}

function respond(req, res, next) {
    var layers = req.query.LAYERS || req.query.layers || req.query.Layers;
    var width = req.query.WIDTH || req.query.width || req.query.Width;
    var height = req.query.HEIGHT || req.query.height || req.query.Height;
    var bbox = req.query.BBOX || req.query.bbox || req.query.Bbox;
    var sbbox = bbox.split(",");
    var minx = sbbox[0].trim();
    var miny = sbbox[1].trim();
    var maxx = sbbox[2].trim();
    var maxy = sbbox[3].trim();
    var srs = req.query.SRS||req.query.srs;

    var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";

    log(title + "\n### Request:\n\n" + req.headers.host + req.url + "\n", nonce);
    var docs = getDocsFromLayers(layers);

    log("### will process " + docs.length + " files (" + docs + ")\n", nonce);
    //Asynchronous
    var tasks = getCommandArray(docs, nonce, srs, minx, miny, maxx, maxy, width, height);

    log("### cut out the right parts:", nonce);

    async.parallel(tasks, function (err, results) {
        if (!err) {
            //at the end
            if (conf.speechComments) {
                execSync("say convert");
            }

            //var convertCmd = "convert " + conf.tmpFolder + "*part.resized" + nonce + "* -background none  -compose DstOver -layers merge " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
            var convertCmd = "gdal_translate -q --config GDAL_PAM_ENABLED NO -of png " + conf.tmpFolder + "all.parts.resized" + nonce + ".tif " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
            log("\n### merge/convert the image to the resulting png:\n" + convertCmd, nonce);

            execAsync(convertCmd, function (error, stdout, stderr) {
                if (error) {
                    log("\n\n### There seems to be at least one (conversion) error :-/\n" + error.message, nonce);
                    if (!conf.keepFilesForDebugging) {
                        execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
                    }
                    return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
                } else {
                    var img = fs.readFileSync(conf.tmpFolder + "all.parts.resized" + nonce + ".png");
                    res.writeHead(200, {'Content-Type': 'image/png'});
                    res.end(img, 'binary');
                    if (conf.speechComments) {
                        execSync("say done");
                    }
                    log("\n\n### Everything seems to be 200 ok", nonce);
                    if (!conf.keepFilesForDebugging) {
                        execSync("rm " + conf.tmpFolder + "*" + nonce + "*");
                    }
                    return next();
                }
            });


        } else {
            if (conf.speechComments) {
                execSync("say error");
            }
            log("\n\n### There seems to be at least one error :-/\n" + err.message, nonce);
            if (!conf.keepFilesForDebugging) {
                execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
            }
            return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + err.message));
        }
    });
}

function getDocsFromLayers(layers) {
    var docs = layers.split(",");
    for (var i = 0, l = docs.length; i < l; i++) {
        var doc = docs[i];
        docs[i] = getDocPathFromLayerPart(doc);
    }
    return docs;
}

//either the LAYERS variable contains the the path to the images (seperated by ,) or it comtains a identifier that a custom function can handle
function getDocPathFromLayerPart(layerPart) {
    if (customExtensions !== undefined && typeof customExtensions.customConvertLayerPartToDoc === 'function') {
        return customExtensions.customConvertLayerPartToDoc(layerPart);
    } else {
        return layerPart;
    }
}


function getCommandArray(docs, nonce, srs, minx, miny, maxx, maxy, width, height) {
    var tasks = [];
    let doclist="";
    console.log(docs);
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        var path = originalDoc.split('/');
        doclist=doclist + originalDoc+ " ";
    }
    console.log(doclist);
    tasks.push(createWarpTask(nonce, originalDoc, doclist, srs, minx, miny, maxx, maxy, width, height));
    return tasks;
}

function createWarpTask(nonce, originalDoc, doclist, srs, minx, miny, maxx, maxy, width, height) {
    return function (callback) {
        if (conf.speechComments) {
            execAsync("say go");
        }
        var cmd = "gdalwarp " +
                "-srcnodata '" + conf.nodata_color + "' " +
                "-dstalpha " +
                "-r " + conf.interpolation + " " +
                "-overwrite " +
                "-s_srs " + conf.sourceSRS + " " +
                "-te " + minx + " " + miny + " " + maxx + " " + maxy + " " +
                "-t_srs " + srs + " " +
                "-ts " + width + " " + height + " " +
                doclist + " " +
                conf.tmpFolder + "all.parts.resized" + nonce + ".tif ";
        log(cmd, nonce);
        execAsync(cmd, null, function (error, stdout, stderr) {
            if (error) {
                if (!conf.tolerantMode) {
                    callback(new Error("failed getting something:" + error.message));
                } else {
                    log("\n\n### There seems to be an error :-/ Will ignore because of the tolerantMode\n" + error.message, nonce);
                    callback(null, true);
                }
            } else {
                callback(null, true);
            }
        });
    };
}


var server = restify.createServer();
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());

server.get('/geoDocWMS/', respond);
server.get('/rasterfariWMS/', respond);
server.head('/geoDocWMS/', respond);

server.pre(restify.pre.userAgentConnection());
console.log("Listening on port:"+conf.port);

server.listen(conf.port, conf.host)