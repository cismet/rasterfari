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

    log("### will process " + docs.length + " files (" + docs + ")\n", nonce);


    let vrt=getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy,width, height);
    let trans=getTranslateCommand(layers, nonce, width, height,srs, minx, miny, maxx, maxy);

    console.log("\n\n\n");
    console.log(":::"+vrt); 
    console.log("\n");
    console.log(":::"+trans);
    console.log("\n\n\n");
    
    /*execAsync(vrt, function (error, stdout, stderr) {
        if (error) {
            log("\n\n### There seems to be at least one (conversion) error :-/\n" + error.message, nonce);
            if (!conf.keepFilesForDebugging) {
                execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
            }
            return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
        } else {*/
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
            });/*
        }
    });*/




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

function getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy, width, height) {
    let doclist="";
    for (var i = 0; i < docs.length; i++) {
        var originalDoc = docs[i];
        doclist=doclist + originalDoc+ " ";
    }

    if (true) {
        return "";
    } else {
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
}

function getTranslateCommand(layers, nonce, width, height, srs, minx, miny, maxx, maxy) {
    let inputImage = layers;
    let outputImage = "PNG32:"+conf.tmpFolder + "all.parts.resized" + nonce + ".png";
    
    if (true) {        
        
        if (minx > 1 || miny > 1 || maxx < 0 || maxy < 0) {
            // boundingbox is completly outside of the image
            // we just have to return an empty image
            let cmd = "convert"
            + " -size " + width + "x" + height
            + " xc:none"
            + " " + outputImage;
            return cmd;
        } else {            
            // calculating the resulting image

            // the size and ratio of the original document
            let imageSize = String(execSync("identify -ping -format '%[w]x%[h]' " + layers));
            let imageWidth = imageSize.split("x")[0];
            let imageHeight = imageSize.split("x")[1];
            let imageRatio = imageWidth / imageHeight;        

            // the bounding box of the area we want to show
            let boundingboxX1 = minx;
            let boundingboxY1 = miny;
            let boundingboxX2 = maxx;
            let boundingboxY2 = maxy;
            let boundingboxWidth = boundingboxX2 - boundingboxX1;
            let boundingboxHeight = boundingboxY2 - boundingboxY1;
            
            // the ratio of the image we are generating
            let targetRatio = width / height;

            // before doing anything, we extent the original image so that it
            // matches the ratio of the image we are generating        
            let extentWidth = imageWidth;
            let extentHeight = imageHeight;
            if (imageRatio > targetRatio) {
                extentHeight = Math.floor(imageWidth / targetRatio);
            } else {
                extentWidth = Math.floor(imageHeight * targetRatio);
            }
                        
            // croping the sides that are not part of the boundingbox
            let cropX = Math.floor(boundingboxX1 * extentWidth);
            let cropY = Math.floor(boundingboxY1 * extentHeight);
            let cropWidth = Math.floor(boundingboxWidth * extentWidth);
            let cropHeight = Math.floor(boundingboxHeight * extentHeight);

            // if the boundingbox is partialy outside of the original image,
            // the result of the croped image is missing the outside areas.
            // we need to add them back by doing an extent.
            let extentX = 0;
            let extentY = 0;
            if (cropX < 0) {
                extentX = cropX;
            }
            if (cropY < 0) {
                extentY = cropY;
            }

            let extentTargetRatio = " -gravity Southwest -extent " + extentWidth + "x" + extentHeight;
            let crop = " -gravity Southwest -crop " + cropWidth + "x" + cropHeight + (cropX < 0 ? cropX : "+" + cropX) + (cropY < 0 ? cropY : "+" + cropY);
            let extent = " -extent " + cropWidth + "x" + cropHeight + (extentX < 0 ? extentX : "+" + extentX) + (extentY < 0 ? extentY : "+" + extentY);
            let resize = " -scale " + width + "x" + height + "!";

            let cmd = "convert " + inputImage + " -background none"
            + extentTargetRatio  // 1) centered extent for matching target ratio
            + crop               // 2) top-left crop for removing areas outside of the boundingbox
            + extent             // 3) readding potential missing empty borders by extent
            + resize             // 4) resizing to target size (!enforcing both dimensions)
            + " " + outputImage;
            
            return cmd;
        }
    } else {
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
                outputImage;
    }            
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