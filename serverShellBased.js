var restify = require('restify');
//var util = require("util");
var execSync = require('child_process').execSync;
var execAsync = require('child_process').exec;

var fs = require('fs');
var clustered_node = require("clustered-node");

function readyWithShit(error, stdout, stderr) {
    console.log("done with gdal " + stdout);
}

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
    var srs= req.params.SRS;
    
     console.log(srs);
    
    var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";
    console.log(layers);
    var docs = getDocsFromLayers(layers);
    var cmd = getCommands(docs, nonce, srs,  minx, miny, maxx, maxy, width, height);

    console.log(cmd);

    execSync(cmd);

    var img = fs.readFileSync("./tmp/all.parts.resized" + nonce + ".png");
    res.writeHead(200, {'Content-Type': 'image/png'});
    res.end(img, 'binary');
    execSync("say done");
    //execSync("rm ./tmp/*"+nonce+"*")
    return next();
}

function getDocsFromLayers(layers) {
    var docs = layers.split(",");
    for (var i = 0, l = docs.length; i < l; i++) {
        var doc = docs[i];
        if (doc.startsWith('R')) {
            docs[i] = "./bplaene_etrs/rechtsk/B" + doc.substring(1, doc.length) + ".tif"
        } else if (doc.startsWith('N')) {
            docs[i] = "./bplaene_etrs/nicht_rechtsk/B" + doc.substring(1, doc.length) + ".tif"
        }

    }
    return docs;
}

function getCommands(docs, nonce,srs, minx, miny, maxx, maxy, width, height) {
    var cmd = "touch ./tmp/processing_of_" + nonce + "in_progress &&";
    console.log(docs);
    var convertPart = "";
    for (var i = 0, l = docs.length; i < l; i++) {
        var originalDoc = docs[i];
        var path = originalDoc.split('/');
        var doc = path[path.length - 1];
        console.log(doc)
        cmd += " say cut out && " +
                //get the right portion of the file
                "gdalwarp " +
                "-srcnodata '249 249 249' " +
                "-dstalpha " +
                //"-r cubicspline " +
                "-overwrite " +
                "-s_srs EPSG:25832 " +        
                "-te " + minx + " " + miny + " " + maxx + " " + maxy + " " +
                "-t_srs " + srs + " "+
                "-ts " + width + " " + height + " " +
                originalDoc + " " +
                "./tmp/" + doc + ".part.resized" + nonce + ".tif && ";

        convertPart += "./tmp/" + doc + ".part.resized" + nonce + ".tif "
        if (i > 0) {
            convertPart += "  -composite "
        }
    }
    //cmd += "gdal_merge.py -o  ./tmp/all.parts.resized" + nonce + ".tif ./tmp/*" + nonce + ".tif &&";



    cmd += "say convert && " +
            // convert it to png
            //with ImageMgick convert
            "convert ";//-resize "+width + "x" + height + "! ";
    if (docs.length > 1) {
        cmd += convertPart +  "./tmp/all.parts.resized" + nonce + ".tif && convert  ./tmp/all.parts.resized" + nonce + ".tif  ./tmp/all.parts.resized" + nonce + ".png";
    } else {
        cmd += "./tmp/*" + nonce + ".tif  ./tmp/all.parts.resized" + nonce + ".png";
    }
   // cmd += "./tmp/all.parts.resized" + nonce + ".png";

    return cmd;
}

var server = restify.createServer();
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.get('/geoDocWMS/', respond);
server.head('/geoDocWMS/', respond);

server.pre(restify.pre.userAgentConnection());

clustered_node.listen({port: 8081, workers: 14}, server);

