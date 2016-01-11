var title = "";
title += "               _             __            _" + "\n";
title += " _ __ __ _ ___| |_ ___ _ __ \/ _| __ _ _ __(_)" + "\n";
title += "| '__\/ _` \/ __| __\/ _ \ '__| |_ \/ _` | '__| |" + "\n";
title += "| | | (_| \__ \ ||  __\/ |  |  _| (_| | |  | |" + "\n";
title += "|_|  \__,_|___\/\__\___|_|  |_|  \__,_|_|  |_|" + "\n";



var restify = require('restify');
var execSync = require('child_process').execSync;
var execAsync = require('child_process').exec;
var async = require('async');
var extConf = require('./config.json');
var fs = require('fs');
var clustered_node = require("clustered-node");
if (extConf.customExtensions !== undefined) {
    var customExtensions = require(extConf.customExtensions);
    // console.log("custom extensions loaded from " + configuration.custom);
} else {
    //console.log("no custom extensions loaded");
}

var defaults = {
    "port": 8081,
    "workers": 10,
    "tmpFolder": "./tmp/",
    "keepFilesForDebugging": false,
    "speechComments": false,
    "sourceSRS": "EPSG:25832",
    "nodata_color": "249 249 249",
    "interpolation": "average"
};

var conf = {
    "port": extConf.port || defaults.port,
    "workers": extConf.workers || defaults.workers,
    "tmpFolder": extConf.tmpFolder || defaults.tmpFolder,
    "keepFilesForDebugging": extConf.keepFilesForDebugging || defaults.keepFilesForDebugging,
    "speechComments": extConf.speechComments || defaults.speechComments,
    "sourceSRS": extConf.sourceSRS || defaults.sourceSRS,
    "nodata_color": extConf.nodata_color || defaults.nodata_color,
    "interpolation": extConf.interpolation || defaults.interpolation
};

if (!fs.existsSync(conf.tmpFolder)){
    fs.mkdirSync(conf.tmpFolder);
}


function log(message, nonce) {
    fs.appendFile(conf.tmpFolder + "processing_of_" + nonce + ".log", message + '\n');
}

function respond(req, res, next) {
    var layers = req.params.LAYERS||req.params.layers||req.params.Layers;
    var width = req.params.WIDTH||req.params.width||req.params.Width;
    var height = req.params.HEIGHT||req.params.height||req.params.Height;;
    var bbox = req.params.BBOX||req.params.bbox||req.params.Bbox;
    var sbbox = bbox.split(",");
    var minx = sbbox[0].trim();
    var miny = sbbox[1].trim();
    var maxx = sbbox[2].trim();
    var maxy = sbbox[3].trim();
    var srs = req.params.SRS;

    var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";

    log(title + "\n### Request:\n\n" + req.headers.host + req.url + "\n", nonce);
    var docs = getDocsFromLayers(layers);

    log("### will process " + docs.length + " files (" + docs + ")\n", nonce);
    //Asynchronous
    var result = getCommandArray(docs, nonce, srs, minx, miny, maxx, maxy, width, height);
    var tasks = result[0];
    var convertCmd = result[1];

    log("### cut out the right parts:", nonce);

    async.parallel(tasks, function (err, results) {
        if (!err) {
            //at the end
            if (conf.speechComments) {
                execSync("say convert");
            }

            log("\n### merge/convert the image to the resulting png:\n" + convertCmd, nonce);

            execSync(convertCmd);
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
    var convertPart = "";
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        var path = originalDoc.split('/');
        var doc = path[path.length - 1];
        tasks.push(createWarpTask(nonce, originalDoc, doc, srs, minx, miny, maxx, maxy, width, height));
        convertPart += conf.tmpFolder + doc + ".part.resized" + nonce + ".tif ";
    }
    var convertCmd = "convert ";
    if (docs.length > 1) {
        convertCmd += convertPart + " -background none  -compose DstOver -layers merge " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
    } else {
        convertCmd += conf.tmpFolder + "*" + nonce + ".tif " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
    }
    return [tasks, convertCmd];
}

function createWarpTask(nonce, originalDoc, doc, srs, minx, miny, maxx, maxy, width, height) {
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
                originalDoc + " " +
                conf.tmpFolder + doc + ".part.resized" + nonce + ".tif ";
        log(cmd, nonce);
        execAsync(cmd, null, function (error, stdout, stderr) {
            if (error) {
                callback(new Error("failed getting something:" + error.message));
            } else {
                callback(null, true);
            }
        });
    };
}


var server = restify.createServer();
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.get('/geoDocWMS/', respond);
server.get('/rasterfariWMS/', respond);
server.head('/geoDocWMS/', respond);

server.pre(restify.pre.userAgentConnection());

//change localhost to real adress. otherwise you will get connection refused errors
clustered_node.listen({port: conf.port, host: "localhost", workers: conf.workers}, server);

