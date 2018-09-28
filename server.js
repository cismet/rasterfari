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
//var async = require('async');
var spawnSync = require('child_process').spawnSync;
var fx = require('mkdir-recursive');

var sleep = (ms) => spawnSync(process.argv[0], ['-e', 'setTimeout(function(){},' + ms + ')']);
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
    console.log(message);
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

    extractMultipageIfNeeded(docs, () => {

        log("### will process " + docs.length + " files (" + docs + ")\n", nonce);

        createWorldFilesIfNeeded(docs, () => {
            let vrt=getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy,width, height);
            let trans=getTranslateCommand(nonce, width, height,srs, minx, miny, maxx, maxy);
        
            console.log("\n\n\n");
            console.log(":::"+vrt); 
            console.log("\n");
            console.log(":::"+trans);
            console.log("\n\n\n");
            
            execAsync(vrt, function (error, stdout, stderr) {
                if (error) {
                    log("\n\n### There seems to be at least one (conversion) error :-/\n" + error.message, nonce);
                    if (!conf.keepFilesForDebugging) {
                        execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
                    }
                    return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
                } else {
                    execAsync(trans, function (error, stdout, stderr) {
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
                }
            });
        
            // async.parallel(tasks, function (err, results) {
            //     if (!err) {
            //         //at the end
            //         if (conf.speechComments) {
            //             execSync("say convert");
            //         }
        
            //         //var convertCmd = "convert " + conf.tmpFolder + "*part.resized" + nonce + "* -background none  -compose DstOver -layers merge " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
            //         var convertCmd = "gdal_translate -q --config GDAL_PAM_ENABLED NO -of png " + conf.tmpFolder + "all.parts.resized" + nonce + ".tif " + conf.tmpFolder + "all.parts.resized" + nonce + ".png";
            //         log("\n### merge/convert the image to the resulting png:\n" + convertCmd, nonce);
        
            //         execAsync(convertCmd, function (error, stdout, stderr) {
            //             if (error) {
            //                 log("\n\n### There seems to be at least one (conversion) error :-/\n" + error.message, nonce);
            //                 if (!conf.keepFilesForDebugging) {
            //                     execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
            //                 }
            //                 return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
            //             } else {
            //                 var img = fs.readFileSync(conf.tmpFolder + "all.parts.resized" + nonce + ".png");
            //                 res.writeHead(200, {'Content-Type': 'image/png'});
            //                 res.end(img, 'binary');
            //                 if (conf.speechComments) {
            //                     execSync("say done");
            //                 }
            //                 log("\n\n### Everything seems to be 200 ok", nonce);
            //                 if (!conf.keepFilesForDebugging) {
            //                     execSync("rm " + conf.tmpFolder + "*" + nonce + "*");
            //                 }
            //                 return next();
            //             }
            //         });
        
        
            //     } else {
            //         if (conf.speechComments) {
            //             execSync("say error");
            //         }
            //         log("\n\n### There seems to be at least one error :-/\n" + err.message, nonce);
            //         if (!conf.keepFilesForDebugging) {
            //             execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
            //         }
            //         return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + err.message));
            //     }
            // });
        });
    });    
}

const regexMultiPage = /\[\d+\]$/; 

async function extractMultipageIfNeeded(docs, next) {
    for (var i = 0, l = docs.length; i < l; i++) {
        var doc = docs[i];
        if (regexMultiPage.test(doc)) {
            let imageName = doc.replace(regexMultiPage, "");
            let multipageDir = imageName + ".multipage";
            if (!fs.existsSync(multipageDir)) {
                fx.mkdirSync(multipageDir);
                let splitPagesCmd = "convert " + imageName + " " + multipageDir + "/%d.tiff";
                execSync(splitPagesCmd);
                console.log(":::" + splitPagesCmd);
            }
            docs[i] = identifyMultipageImage(doc);
        }
    }
    next();
}

function createWorldFilesIfNeeded(docs, next) {
    let done = 0;
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        if (!fs.existsSync(originalDoc)) {
            continue;
        }

        let docSplit = originalDoc.split('.');
        let docEnding = docSplit.slice(-1).join('.');
        let worldFileEnding;

        if (docEnding === 'tif' || docEnding === 'tiff') {
            worldFileEnding = 'tfw';
        } else if (docEnding === 'jpg' || docEnding === 'jpeg') {
            worldFileEnding = 'jgw';
        } else if (docEnding === 'png') {
            worldFileEnding = 'pgw';
        } else if (docEnding === 'gif') {
            worldFileEnding = 'gfw';
        }

        let worldFile = docSplit.reverse().slice(1).reverse().concat(worldFileEnding).join('.');
        
        if (!fs.existsSync(worldFile)) {
            let imageSize = String(execSync("identify -ping -format '%[w]x%[h]' " + originalDoc));
            let imageWidth = imageSize.split("x")[0];
            let imageHeight = imageSize.split("x")[1];            
            let worldFileData = calculateWorldFileData(imageWidth, imageHeight);
            //console.log(worldFileData);
                        
            let fd = fs.openSync(worldFile, 'w');

            let buffer = new Buffer(
                worldFileData.xScale + '\n' +
                worldFileData.ySkew + '\n' +
                worldFileData.xSkew + '\n' +
                worldFileData.yScale + '\n' +
                worldFileData.x + '\n' +
                worldFileData.y + '\n' +
                ''
            );

            fs.writeSync(fd, buffer, 0, buffer.length, null);
            fs.closeSync(fd);

            console.log("start waiting");
            let fileExists = false;
            let sleepCycles = 0;
            let sleepInterval = 100;
            let maxSleep = 2000;
            while (!fileExists) {
                fileExists = fs.existsSync(worldFile);
                sleep(sleepInterval);
                if (++sleepCycles * sleepInterval > maxSleep) {
                    break;
                }
                if (fileExists) {
                    continue;
                }
            }
            console.log("done waiting");

            /*
            // https://www.daveeddy.com/2013/03/26/synchronous-file-io-in-nodejs/
            fs.appendFile(worldFile,
                worldFileData.xScale + '\n' +
                worldFileData.ySkew + '\n' +
                worldFileData.xSkew + '\n' +
                worldFileData.yScale + '\n' +
                worldFileData.x + '\n' +
                worldFileData.y + '\n' +
                ''
            );
            */
        }
    }
    next();
}

function identifyMultipageImage(doc) {
    if (doc.match(regexMultiPage)) {
        let imageName = doc.replace(regexMultiPage, "");
        let multipageDir = imageName + ".multipage";
        let page = parseInt(String(doc.match(regexMultiPage, "")).replace(/[\[\]]/, ""));
    
        let inputImage = multipageDir + "/" + page + ".tiff";
        return inputImage;    
    } else {
        return doc;
    }
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

function getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy,width, height) {
    let doclist="";
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        doclist=doclist + originalDoc+ " ";
    }

    if (conf.sourceSRS===srs){
        return "gdalbuildvrt "+
        "-srcnodata '" + conf.nodata_color + "' "+
        "-r average -overwrite " + 
        "-te " + minx + " " + miny + " " + maxx + " " + maxy + " " +
        conf.tmpFolder + "all.parts.resized" + nonce + ".vrt "+
        doclist;     
    }
    else {
         let cmd = 
             "gdalwarp " +
                "-srcnodata '" + conf.nodata_color + "' " +
                "-dstalpha " +
                "-r " + conf.interpolation + " " +
                "-overwrite " +
                "-s_srs " + conf.sourceSRS + " " +
                "-te " + minx + " " + miny + " " + maxx + " " + maxy + " " +
                "-t_srs " + srs + " " +
                "-ts " + width + " " + height + " " +
                "-of GTiff " +
                doclist + " "  +
                conf.tmpFolder + "all.parts.resized" + nonce + ".tif ";
        return cmd;
    }
}

function getTranslateCommand(nonce, width, height,srs, minx, miny, maxx, maxy) {
    
    return  "gdal_translate "+
            "-a_nodata '" + conf.nodata_color + "' "+ 
            "-q " +
            "-outsize " + width + " " + height + " " +
            "--config GDAL_PAM_ENABLED NO "+
            "-of png "+
            conf.tmpFolder + "all.parts.resized" + nonce + ".* "+
            conf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png "+
            "&& convert -background none "+
            conf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png "+
            "PNG32:"+conf.tmpFolder + "all.parts.resized" + nonce + ".png ";
}


function calculateWorldFileData(imageWidth, imageHeight) {
/*  // UPPER LEFT
    let xul = 0;
    let yul = 1;
    let xlr = (imageWidth > imageHeight) ? imageHeight / imageWidth : imageWidth / imageHeight;
    let ylr = 0;
*/

    // CENTER
    let xul = (imageWidth > imageHeight) ? -0.5 : imageWidth / imageHeight / -2;
    let yul = (imageWidth > imageHeight) ? imageHeight / imageWidth / 2 : 0.5;
    let xlr = (imageWidth > imageHeight) ? 0.5 : imageWidth / imageHeight / 2;
    let ylr = (imageWidth > imageHeight) ? imageHeight / imageWidth / -2 : -0.5;

    let xScale = (xlr - xul) / imageWidth;  // x-component of the pixel width (x-scale)
    let ySkew = 0;                          // y-component of the pixel width (y-skew)
    let xSkew = 0;                          // x-component of the pixel height (x-skew)
    let yScale = (ylr - yul) / imageHeight; // y-component of the pixel height (y-scale), typically negative
    let x = xul + (xScale * .5);            // x-coordinate of the center of the upper left pixel 
    let y = yul + (yScale * .5);            // y-coordinate of the center of the upper left pixel

    return { xScale: xScale, ySkew: ySkew, xSkew: xSkew, yScale: yScale, x: x, y: y};
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