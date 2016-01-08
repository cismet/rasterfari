//console.log("                 _             __            _ ");
//console.log("   _ __ __ _ ___| |_ ___ _ __ / _| __ _ _ __(_)");
//console.log("  | '__/ _` / __| __/ _ \ '__| |_ / _` | '__| |");
//console.log("  | | | (_| \__ \ ||  __/ |  |  _| (_| | |  | |");
//console.log("  |_|  \__,_|___/\__\___|_|  |_|  \__,_|_|  |_|");

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
    "docFolder": "./exampleDocs/",
    "tmpFolder": "./tmp/",
    "keepFilesForDebugging": false,
    "speechComments": false,
    "sourceSRS": "EPSG:25832",
    "nodata_color": "249 249 249"
};

var conf = {
    "port": extConf.port || defaults.port,
    "workers": extConf.workers || defaults.workers,
    "docFolder": extConf.docFolder || defaults.docFolder,
    "tmpFolder": extConf.tmpFolder || defaults.tmpFolder,
    "keepFilesForDebugging": extConf.keepFilesForDebugging || defaults.keepFilesForDebugging,
    "speechComments": extConf.speechComments || defaults.speechComments,
    "sourceSRS": extConf.sourceSRS || defaults.sourceSRS,
    "nodata_color": extConf.nodata_color || defaults.nodata_color

};

function respond(req, res, next) {
    var layers = req.params.LAYERS;
    var width = req.params.WIDTH;
    var height = req.params.HEIGHT;
    var bbox = req.params.BBOX;
    var sbbox = bbox.split(",");
    var minx = sbbox[0].trim();
    var miny = sbbox[1].trim();
    var maxx = sbbox[2].trim();
    var maxy = sbbox[3].trim();
    var srs = req.params.SRS;

    var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";

    var docs = getDocsFromLayers(layers);

    //Asynchronous
    var result = getCommandArray(docs, nonce, srs, minx, miny, maxx, maxy, width, height);
    var tasks = result[0];
    var convertCmd = result[1];

    console.log(tasks);


    async.parallel(tasks, function () {
        //at the end
        if (conf.speechComments) {
            execSync("say convert");
        }
        execSync(convertCmd);
        var img = fs.readFileSync(conf.tmpFolder + "all.parts.resized" + nonce + ".png");
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(img, 'binary');
        if (conf.speechComments) {
            execSync("say done");
        }
        if (!conf.keepFilesForDebugging) {
            execSync("rm " + conf.tmpFolder + "*" + nonce + "*")
        }
        return next();
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


function getDocPathFromLayerPart(layerPart) {
    if (customExtensions !== undefined && typeof customExtensions.customConvertLayerPartToDoc === 'function') {
        return customExtensions.customConvertLayerPartToDoc(layerPart);
    } else {
        return layerPart;
    }
}


function getCommandArray(docs, nonce, srs, minx, miny, maxx, maxy, width, height) {
    var tasks = [];
    tasks.push(function (callback) {
        execAsync("touch " + conf.tmpFolder + "processing_of_" + nonce + "in_progress", null, function (error, stdout, stderr) {
            callback(null, true);
        });
    });
    var convertPart = "";
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        var path = originalDoc.split('/');
        var doc = path[path.length - 1];
        console.log(doc);
        tasks.push(createWarpTask(nonce, originalDoc, doc, srs, minx, miny, maxx, maxy, width, height));
        convertPart += conf.tmpFolder + doc + ".part.resized" + nonce + ".tif ";
        if (i > 0) {
            convertPart += "  -composite ";
        }
    }
    var convertCmd = "convert ";
    if (docs.length > 1) {
        convertCmd += convertPart + conf.tmpFolder + "all.parts.resized" + nonce + ".tif && convert " + conf.tmpFolder + "all.parts.resized" + nonce + ".tif " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
    } else {
        convertCmd += conf.tmpFolder + "*" + nonce + ".tif " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
    }
    return [tasks, convertCmd];
}

function createWarpTask(nonce, originalDoc, doc, srs, minx, miny, maxx, maxy, width, height) {
    return function (callback) {
        console.log("jetzt:" + doc);
        if (conf.speechComments) {
            execAsync("say go");
        }
        var cmd = "gdalwarp " +
                "-srcnodata '"+conf.nodata_color+"' " +
                "-dstalpha " +
                // "-r near " +
                "-r average " +
                // "-r bilinear " +
                //"-r cubic " +
                // "-r cubicspline " +
                //"-r lanczos " +
                //"-r mode " +
                "-overwrite " +
                "-s_srs " + conf.sourceSRS + " " +
                "-te " + minx + " " + miny + " " + maxx + " " + maxy + " " +
                "-t_srs " + srs + " " +
                "-ts " + width + " " + height + " " +
                originalDoc + " " +
                conf.tmpFolder + doc + ".part.resized" + nonce + ".tif ";
        console.log(cmd);
        execAsync(cmd, null, function (error, stdout, stderr) {
            callback(null, true);
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

clustered_node.listen({port: conf.port, workers: conf.workers}, server);

