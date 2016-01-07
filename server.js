var restify = require('restify');
var gdal = require("gdal");
var execSync = require('child_process').execSync;
var fs = require('fs');
var clustered_node = require("clustered-node");

function readyWithShit(error, stdout, stderr) {
    console.log("done with gdal "+stdout);
}

function respond(req, res, next) {
  //  console.log(req);
    var name=req.params.LAYERS;
    var width=req.params.WIDTH;
    var height=req.params.HEIGHT;
    var bbox=req.params.BBOX;
    var sbbox=bbox.split(",");
    var minx=sbbox[0].trim();
    var miny=sbbox[1].trim();
    var maxx=sbbox[2].trim();
    var maxy=sbbox[3].trim();
    
   var cmd="say cut out && " +
            //get the right portion of the file
            "gdalwarp "+
            "-srcnodata '249 249 249' "+
            "-dstnodata '249 249 249' "+
            "-r cubicspline " +
            "-overwrite "+
            "-te "+minx+" "+miny+" "+maxx+" "+maxy+" "+
            "-ts "+width+" "+height+" "+
            "./docs/"+name+" "+
            "./tmp/"+name+".part.resized.tif && "+
            "say convert && "+
           // convert it to png
            "gdal_translate "+ 
            "-a_nodata '249 249 249' "+
            "-of png "+
            "./tmp/"+name+".part.resized.tif "+
            "./tmp/"+name+".part.resizedx.png"+
            " &&"+
            "say repair && "+
            //unfortunately there is something wrong with the transparency of the png
            //repair it with ImageMgick convert
            "convert "+
            "./tmp/"+name+".part.resizedx.png "+
            "-resize "+width + "x" + height + "! " +
            "./tmp/"+name+".part.resized.png";
            

    var dataset = gdal.open("./docs/"+name);

    console.log("version: " + gdal.version);
console.log("number of bands: " + dataset.bands.count());
console.log("width: " + dataset.rasterSize.x);
console.log("height: " + dataset.rasterSize.y);
console.log("geotransform: " + dataset.geoTransform);
console.log("srs: " + (dataset.srs ? dataset.srs.toWKT() : 'null'));

    var img = fs.readFileSync("./tmp/"+name+".part.resized.png");
    res.writeHead(200, {'Content-Type': 'image/png' });
    res.end(img, 'binary');
    execSync("say done");

    return next();
}

var server = restify.createServer();
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

server.get('/geoDocWMS/', respond);
server.head('/geoDocWMS/', respond);

server.pre(restify.pre.userAgentConnection());

clustered_node.listen({port:8081, workers:4}, server);

