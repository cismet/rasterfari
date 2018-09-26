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
var extConf = require('./config.json');
var gm = require('gm').subClass({imageMagick: true});
var fx = require('mkdir-recursive');
var sharp = require('sharp');

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
    var width = parseInt(req.query.WIDTH || req.query.width || req.query.Width);
    var height = parseInt(req.query.HEIGHT || req.query.height || req.query.Height);
    var bbox = req.query.BBOX || req.query.bbox || req.query.Bbox;
    var sbbox = bbox.split(",");
    var minx = parseFloat(sbbox[0].trim());
    var miny = parseFloat(sbbox[1].trim());
    var maxx = parseFloat(sbbox[2].trim());
    var maxy = parseFloat(sbbox[3].trim());
    var srs = req.query.SRS||req.query.srs;

    var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";
    log(title + "\n### Request:\n\n" + req.headers.host + req.url + "\n", nonce);

    if (/\[\d+\]$/.test(layers)) {
        let imageName = layers.replace(/\[\d+\]$/, "");
        let multipageDir = conf.tmpFolder + imageName;
        if (!fs.existsSync(multipageDir)) {
            fx.mkdir(multipageDir, (err) => {
                let splitPagesCmd = "convert " + imageName + " " + multipageDir + "/%d.png";
                execAsync(splitPagesCmd, () => {
                    console.log(":::" + splitPagesCmd);
                    main(res, nonce, layers, width, height, minx, miny, maxx, maxy, srs, next);
                });
            });        
        } else {
            main(res, nonce, layers, width, height, minx, miny, maxx, maxy, srs, next);
        }
    } else {
        main(res, nonce, layers, width, height, minx, miny, maxx, maxy, srs, next);
    }
}

function main(res, nonce, layers, width, height, minx, miny, maxx, maxy, srs, next) {
    if (srs === "testSharp") {
        let inputImage = identifyMultipageImage(layers);
        withSharp(inputImage, width, height, minx, miny, maxx, maxy, next, res)
    } else if (srs === "testGM") {
        let inputImage = identifyMultipageImage(layers);
        withGM(inputImage, width, height, minx, miny, maxx, maxy, next, res);
    } else if (srs === "testIM") {
        let inputImage = identifyMultipageImage(layers);
        withImagemagick(inputImage, nonce, width, height, minx, miny, maxx, maxy, next, res);
    } else {
        var docs = getDocsFromLayers(layers);

        log("### will process " + docs.length + " files (" + docs + ")\n", nonce);
    
        let vrt = getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy,width, height);

        let inputImage = layers;
        let outputImage = "PNG32:"+conf.tmpFolder + "all.parts.resized" + nonce + ".png";            
        let trans = getTranslateCommand(inputImage, nonce, outputImage, width, height,srs, minx, miny, maxx, maxy);

        console.log("\n\n\n");
        console.log(":::" + vrt); 
        console.log("\n");
        console.log(":::" + trans);
        console.log("\n\n\n");
        
        execAsync(vrt, vrtCallback(res, nonce, trans, next));
    }

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


function withSharp(inputImage, width, height, minx, miny, maxx, maxy, next, res) {
    let transform = sharp(inputImage);

    let funz = transform.metadata().then(
        async(metadata) => {
            let imageWidth = metadata.width;
            let imageHeight = metadata.height;   

            //console.log(metadata);
            let params = calculateMagickParams(imageWidth, imageHeight, minx, miny, maxx, maxy, width, height);

            console.log("extend");
            console.log(params.extent);
            let extend = { 
                top: Math.ceil((params.extent.height - imageHeight) / 2), 
                right: Math.ceil((params.extent.width - imageWidth) / 2),
                bottom: Math.floor((params.extent.height - imageHeight) / 2), 
                left: Math.floor((params.extent.width - imageWidth) / 2) 
            };
            console.log(extend);
            let extended = await( 
                transform.background({r: 0, g: 0, b: 0, alpha: 0}).extend(extend).toBuffer()
            );

            console.log("extract");
            console.log(params.crop);
            let cropLimitWidth = params.crop.width + params.crop.x < params.extent.width ? params.crop.width : params.extent.width + params.crop.x;
            let cropLimitHeight = params.crop.height + params.crop.y < params.extent.height ? params.crop.height : params.extent.height + params.crop.y;
            let cropLimitLeft = params.crop.x > 0 ? params.crop.x : 0;
            let cropLimitTop = params.crop.y > 0 ? params.crop.y : 0;

            let extract = { 
                width: cropLimitWidth, 
                height: cropLimitHeight,
                left: cropLimitLeft,  
                top: cropLimitTop 
            };            
            console.log(extract);
            let extracted = await(
                sharp(extended).extract(extract).toBuffer()
            );

            console.log("extend2");
            console.log(params.extent2);
            let extend2 = { 
                top: params.extent2.height - params.crop.height - params.extent2.y, 
                right: params.extent2.width - params.crop.width - params.extent2.x,
                bottom: -params.extent2.y, 
                left: -params.extent2.x 
            };            
            console.log(extend2);
            let extended2 = await( 
                sharp(extracted).background({r: 0, g: 0, b: 0, alpha: 0}).extend(extend2).toBuffer()
            );
            
            sharp(extended2).resize(width, height).png().pipe(res);

            res.writeHead(200, {'Content-Type': 'image/png'});        
            return transform;                
        }, (err) => {
            console.error(err);
        }        
    );    
}

function withGM(inputImage, width, height, minx, miny, maxx, maxy, next, res) {
    gm(inputImage).size(function(err, imageSize) {
        let params = calculateMagickParams(
            imageSize.width, 
            imageSize.height, 
            minx, 
            miny, 
            maxx, 
            maxy, 
            width, 
            height
        );

        gm(inputImage)
            .background("none")
            .gravity("Center").extent(params.extent.width, params.extent.height)
            .gravity("SouthWest").crop(params.crop.width, params.crop.height, params.crop.x, params.crop.y)
            .extent(params.extent2.width, params.extent2.height, (params.extent2.x >= 0 ? ("+" + params.extent2.x) : String(params.extent2.x)) + (params.extent2.y >= 0 ? ("+" + params.extent2.y) : String(params.extent2.y)))
            .resize(params.resize.width, params.resize.height, "!")
            .setFormat("PNG32")
            .stream(function streamOut (err, stdout, stderr) {
                if (err) {
                    return next(err);
                }
                res.writeHead(200, {'Content-Type': 'image/png'}); 
                stdout.pipe(res);
        });
    });
}

function withImagemagick(inputImage, nonce, width, height, minx, miny, maxx, maxy, next, res) {
    let outputImage = "PNG32:"+conf.tmpFolder + "all.parts.resized" + nonce + ".png";
            
    let cmd;            
    if (minx > 1 || miny > 1 || maxx < 0 || maxy < 0) {
        // boundingbox is completly outside of the image
        // we just have to return an empty image
        cmd = "convert"
        + " -size " + targetSize
        + " xc:none"
        + " " + outputImage;
    } else {            
        let imageSize = String(execSync("identify -ping -format '%[w]x%[h]' " + inputImage));
        let imageWidth = imageSize.split("x")[0];
        let imageHeight = imageSize.split("x")[1];
        let params = calculateMagickParams(imageWidth, imageHeight, minx, miny, maxx, maxy, width, height);

        let extent = params.extent.width + "x" + params.extent.height;
        let crop = params.crop.width + "x" + params.crop.height + "+" + params.crop.x + "+" + params.crop.y;
        let extent2 = params.crop.width + "x" + params.crop.height + (params.extent2.x >= 0 ? ("+" + params.extent2.x) : String(params.extent2.x)) + (params.extent2.y >= 0 ? ("+" + params.extent2.y) : String(params.extent2.y));
        console.log(extent2);
        let resize = width + "x" + height;

        cmd = "convert " + inputImage
        + " -background none"                   // 1) transparent background
        + " -gravity center -extent " + extent  // 2) centered extent for matching target ratio
        + " -gravity Southwest -crop " + crop   // 3) top-left crop for removing areas outside of the boundingbox
        + " -extent " + extent2                 // 4) readding potential missing empty borders by extent
        + " -resize " + resize + "!"        // 5) resizing to target size (!enforcing both dimensions)
        + " " + outputImage;
    }

    console.log(":::" + cmd);

    execAsync(cmd, transCallback(res, nonce, next));
}

function identifyMultipageImage(layers) {
    if (layers.match(/\[\d+\]$/)) {
        let imageName = layers.replace(/\[\d+\]$/, "");
        let multipageDir = conf.tmpFolder + imageName;
        let page = parseInt(String(layers.match(/\[\d+\]$/, "")).replace(/[\[\]]/, ""));
    
        let inputImage = multipageDir + "/" + page + ".png";
        return inputImage;    
    } else {
        return layers;
    }
}

function vrtCallback(res, nonce, trans, next) {
    return function(error, stdout, stderr) {
        if (error) {
            log("\n\n### There seems to be at least one (conversion) error :-/\n" + error.message, nonce);
            if (!conf.keepFilesForDebugging) {
                execSync("export GLOBIGNORE=*.log &&  rm " + conf.tmpFolder + "*" + nonce + "* 2> /dev/null && export GLOBIGNORE=");
            }
            return next(new restify.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
        } else {
            execAsync(trans, transCallback(res, nonce, next));
        }       
    } 
}

function transCallback(res, nonce, next) {
    return function(error, stdout, stderr) {
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

function getVrtCommand(docs, nonce, srs, minx, miny, maxx, maxy, width, height) {
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
    } else {
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

function calculateMagickParams(imageWidth, imageHeight, minx, miny, maxx, maxy, width, height) {
        // the size and ratio of the image we are generating
        let targetSize = width + "x" + height;
        let targetRatio = width / height;
        
        // calculating the resulting image

        // the size and ratio of the original document            
        let imageRatio = imageWidth / imageHeight;        

        // the bounding box of the area we want to show
        let boundingboxX1 = minx;
        let boundingboxY1 = miny;
        let boundingboxX2 = maxx;
        let boundingboxY2 = maxy;
        let boundingboxWidth = boundingboxX2 - boundingboxX1;
        let boundingboxHeight = boundingboxY2 - boundingboxY1;
        
        // before doing anything, we extent the original image so that it
        // matches the ratio of the image we are generating
        let extentWidth = imageWidth;
        let extentHeight = imageHeight;
        if (imageRatio > 1) {
            extentHeight = Math.floor(imageHeight * imageRatio);
        } else {
            extentWidth = Math.floor(imageWidth / imageRatio);
        }

        
        // now we are croping the sides that are not part of
        // the boundingbox
        let cropX = Math.floor(boundingboxX1 * extentWidth);
        let cropY = Math.floor(boundingboxY1 * extentHeight);
        let cropWidth = Math.floor(boundingboxWidth * extentWidth);
        let cropHeight = Math.floor(boundingboxHeight * extentHeight);

        // if the boundingbox is partialy outside of the original image,
        // the result of the croped image is missing the outside areas.
        // we need to add them back by doing an extent.
        let extent2X = 0;
        let extent2Y = 0;
        if (cropX < 0) {
            extent2X = cropX;
        }
        if (cropY < 0) {
            extent2Y = cropY;
        }

        let magickParams = {
            extent: { width: extentWidth, height: extentHeight },
            crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
            extent2: { x: extent2X, y: extent2Y, width: cropWidth, height: cropHeight },
            resize: { width: width, height: height },
        }

        return magickParams;
}

function getTranslateCommand(inputImage, nonce, outputImage, width, height, srs, minx, miny, maxx, maxy) {            
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