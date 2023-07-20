let title = "";
title += "               _             __            _" + "\n";
title += " _ __ __ _ ___| |_ ___ _ __ / _| __ _ _ __(_)" + "\n";
title += "| '__/ _` / __| __/ _  '__| |_ / _` | '__| |" + "\n";
title += "| | | (_| __  ||  __/ |  |  _| (_| | |  | |" + "\n";
title += "|_|  __,_|___/_____|_|  |_|  __,_|_|  |_|" + "\n";

import { createServer, plugins, pre } from "restify";
import { NotFoundError, InternalServerError } from "restify-errors";
import { execSync } from "child_process";
// const execAsync = require("child_process").exec;
import { execFileSync } from "child_process";
import { execFile as execFileAsync } from "child_process";
//const async = require('async');
import { mkdirSync } from "mkdir-recursive";
import { dirname } from "path";
import { sync } from "read-chunk";
import fileType from "file-type";
import extConf, { customExtensions as _customExtensions } from "./config.json";
import corsMiddleware from "restify-cors-middleware";
import { createHash } from "crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync as _mkdirSync,
  appendFile,
  readFile,
  readdirSync,
  openSync,
  writeSync,
  closeSync,
  symlinkSync,
  statSync,
} from "fs";
import { spawnSync } from "child_process";

const sleep = (ms) =>
  spawnSync(process.argv[0], ["-e", "setTimeout(function(){}," + ms + ")"]);

let defaultConf = {
  port: 8081,
  host: "0.0.0.0",
  workers: 1,
  tmpFolder: "./tmp/",
  cacheFolder: "./cache/",
  keepFilesForDebugging: false,
  speechComments: false,
  tolerantMode: false,
  sourceSRS: "EPSG:25832",
  nodata_color: "249 249 249",
  interpolation: "average",
  geoTif: true,
  dpi: null,
  corsAccessControlAllowOrigins: [
    "http://localhost:*",
    "https://rasterfari.cismet.de",
  ],
  debugLogs: false,
  infoLogs: true,
  warningLogs: true,
  errorLogs: true,
};

const globalConf = getConf();

if (globalConf.debugLogs === false) {
  console.debug = () => {};
}
if (globalConf.infoLogs === false) {
  console.info = () => {};
}
if (globalConf.warningLogs === false) {
  console.warn = () => {};
}
if (globalConf.errorLogs === false) {
  console.error = () => {};
}

if (_customExtensions !== undefined) {
  var customExtensions = require(_customExtensions);

  console.debug("custom extensions loaded", _customExtensions);
} else {
  console.debug("no custom extensions loaded");
}

var globalDirConfs = {};
var chachedLocalDirConfs = {};

if (existsSync("./dirConfigs.json")) {
  globalDirConfs = JSON.parse(readFileSync("./dirConfigs.json"));
}

if (!existsSync(globalConf.tmpFolder)) {
  _mkdirSync(globalConf.tmpFolder);
}
if (!existsSync(globalConf.cacheFolder)) {
  _mkdirSync(globalConf.cacheFolder);
}

function log(message, nonce) {
  appendFile(
    globalConf.tmpFolder + "processing_of_" + nonce + ".log",
    message + "\n",
    (error) => {
      if (error) {
        console.error("Problem during log write");
      }
    }
  );
  console.info(message);
}

function getConf(docInfo) {
  let dirConf = {};

  if (docInfo) {
    let docDir = dirname(docInfo.origPath);
    let docSplit = docDir.split("/");
    for (let i = 0; i < docSplit.length; i++) {
      let dir = docSplit.slice(0, i + 1).join("/");
      let dirConfFile = dir + "/config.json";
      //console.debug("CONF " + i + ": " + dirConfFile);

      if (chachedLocalDirConfs[dir] === undefined) {
        if (existsSync(dirConfFile)) {
          chachedLocalDirConfs[dir] = JSON.parse(readFileSync(dirConfFile));
        }
      }
      dirConf = Object.assign(
        dirConf,
        globalDirConfs[dir],
        chachedLocalDirConfs[dir]
      );
    }
  }
  let conf = Object.assign({}, defaultConf, extConf, dirConf);
  //console.debug(conf);
  return conf;
}

function sanityCheck(germs, rules) {
  for (const key of Object.keys(germs)) {
    const ruleRegex = rules[key];
    if (ruleRegex === undefined) {
      if (globalConf.sanitizingDebug === true) {
        console.error("no sanitizing rule for " + key + ". This is bad");
      }
      throw new Error("Sanitizing Error: No rule for " + key);
    } else {
      if (germs[key] !== undefined && !ruleRegex.test(germs[key])) {
        console.error(
          "sanitizing rule for " +
            key +
            ": " +
            germs[key] +
            " failed. This is bad"
        );
        throw new Error("Sanitizing Error: Sanitizer for " + key + " failed");
      } else {
        if (globalConf.sanitizingDebug === true) {
          console.debug(
            "sanitizing rule for " + key + " passed. This is good",
            germs[key]
          );
        }
      }
    }
  }
}

const regexMultiPage = /\[\d+\]$/; //not used for sanity checks

// parameter sanity checks regexs for reuse
const regExInt = new RegExp(/^(\d+)$/);
const regExFloat = new RegExp(/^-?\d*(\.\d+)?$/);
const regExBoolean = new RegExp(
  /^([Tt][Rr][Uu][Ee]|[Ff][Aa][Ll][Ss][Ee]|0|1)$/
);
const regExContentType = new RegExp(/^(.*)\/.(.*)$/);
const regExSRS = new RegExp(/^EPSG:\d+$/);

// fill the checks reg exs with the samme keys as in the parameter object
const sanityRegExs = {};
sanityRegExs.layers = new RegExp(
  /^(([[a-zA-Z0-9äöüßÄÖÜ]|.| ])+(\/([[a-zA-Z0-9äöüßÄÖÜ]\. +-])*)*(\[\d+\])*)(,(([[a-zA-Z0-9äöüßÄÖÜ]|.| ])+(\/([[a-zA-Z0-9äöüßÄÖÜ]\. -])*)*(\[\d+\])*))*$/
); //basically everything is allowed
//integer
sanityRegExs.width = regExInt;
sanityRegExs.height = regExInt;
//floats
sanityRegExs.customScale = regExFloat;
sanityRegExs.customScaleX = regExFloat;
sanityRegExs.customOffsetX = regExFloat;
sanityRegExs.customOffsetY = regExFloat;
sanityRegExs.minX = regExFloat;
sanityRegExs.minY = regExFloat;
sanityRegExs.maxX = regExFloat;
sanityRegExs.maxY = regExFloat;

sanityRegExs.format = regExContentType;
sanityRegExs.transparent = regExBoolean;
sanityRegExs.rebuildCache = regExBoolean;
sanityRegExs.srs = regExSRS;
sanityRegExs.srcSrs = regExSRS;

sanityRegExs.bbox = new RegExp(
  /^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?),(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/
);
sanityRegExs.service = new RegExp(/^WMS$/, "i");
sanityRegExs.request = new RegExp(/^GetMap$|^translate$/, "i");
sanityRegExs.customDocumentInfo = new RegExp(/^download$/, "i");

function extractParamsFromRequest(req) {
  let layers = req.query.LAYERS || req.query.layers || req.query.Layers;
  let width = req.query.WIDTH || req.query.width || req.query.Width;
  let height = req.query.HEIGHT || req.query.height || req.query.Height;
  let bbox = req.query.BBOX || req.query.bbox || req.query.Bbox;
  var srs = req.query.SRS || req.query.srs;
  var srcSrs = req.query.SRCSRS || req.query.srcsrs;
  let customDocumentInfo =
    req.query.customDocumentInfo ||
    req.query.CUSTOMDOCUMENTINFO ||
    req.query.customdocumentinfo;
  let customScale =
    req.query.customScale ||
    req.query.CUSTOMSCALE ||
    req.query.customscale ||
    "1";
  let customScaleX =
    req.query.customScaleX ||
    req.query.CUSTOMSCALEX ||
    req.query.customscalex ||
    customScale;
  let customScaleY =
    req.query.customScaleY ||
    req.query.CUSTOMSCALEY ||
    req.query.customscaley ||
    customScale;
  let customOffsetX =
    req.query.customOffsetX ||
    req.query.CUSTOMOFFSETX ||
    req.query.customoffsetx ||
    "0";
  let customOffsetY =
    req.query.customOffsetX ||
    req.query.CUSTOMOFFSETY ||
    req.query.customoffsety ||
    "0";

  sanityCheck({ bbox }, sanityRegExs);

  if (bbox) {
    var sbbox = bbox.split(",");
    var minX =
      (parseFloat(sbbox[0].trim()) - parseFloat(customOffsetX.trim())) /
      parseFloat(customScaleX.trim());
    var minY =
      (parseFloat(sbbox[1].trim()) + parseFloat(customOffsetY.trim())) /
      parseFloat(customScaleY.trim());
    var maxX =
      (parseFloat(sbbox[2].trim()) - parseFloat(customOffsetX.trim())) /
      parseFloat(customScaleX.trim());
    var maxY =
      (parseFloat(sbbox[3].trim()) + parseFloat(customOffsetY.trim())) /
      parseFloat(customScaleY.trim());
  }
  let service =
    req.query.SERVICE || req.query.service || req.query.Service || "WMS";
  let request =
    req.query.REQUEST || req.query.request || req.query.Request || "GetMap";
  let format =
    req.query.FORMAT || req.query.format || req.query.Format || "image/png";
  let transparent =
    req.query.TRANSPARENT ||
    req.query.transparent ||
    req.query.Transparent ||
    "true";
  let rebuildCache =
    req.query.REBUILDCACHE ||
    req.query.rebuildcache ||
    req.query.rebuildCache ||
    req.query.Rebuildcache ||
    req.query.RebuildCache ||
    undefined;

  const params = {
    service,
    request,
    format,
    transparent,
    rebuildCache,
    layers,
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    srs,
    srcSrs,
    customDocumentInfo,
  };
  console.debug(params);

  sanityCheck(params, sanityRegExs);
  params.transparent = !(/false/i).test(params.transparent);
  if (params.rebuildCache !== undefined) {
    params.rebuildCache = !(/false/i).test(params.rebuildCache);
  }
  
  return params;
}

function respond(req, res, next) {
  var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";
  log(title + "\n### Request:\n\n" + req.headers.host + req.url + "\n", nonce);
  let params;
  try {
    params = extractParamsFromRequest(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request :-/ \n\nHave a look at the logs.");
    return;
  }
  let {
    layers,
    transparent,
    rebuildCache,
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    srs,
    customDocumentInfo,
  } = params;
  let docInfos = getDocInfosFromLayers(layers);
  let docInfo = docInfos[0];
  let docPath = docInfo.path;
  let localConf = getConf(docInfo);

  if (
    docInfos.length == 1 &&
    customDocumentInfo &&
    "download".localeCompare(customDocumentInfo.toLowerCase()) === 0
  ) {
    readFile(docPath, (error, data) => {
      if (error) {
        log(error);
        return next(
          new NotFoundError(
            "01: there was something wrong with the request. the error message from the underlying process is: " +
              error.message
          )
        );
      } else {
        let buffer = sync(docPath, 0, 4100);
        if (fileType(buffer) !== null) {
          let mime = fileType(buffer).mime;
          res.writeHead(200, { "Content-Type": mime });
        }
        res.end(data, "binary");
      }
    });
    return;
  }

  if (localConf.geoTif) {
    let vrt = getVrtCommand(
      docInfos,
      nonce,
      srs,
      minX,
      minY,
      maxX,
      maxY,
      width,
      height
    );
    let translateAndConvertCommandsVrt = getTranslateAndConvertCommandsVrt(
      docInfos,
      nonce,
      width,
      height
    );

    console.debug("---localConf.geoTif");

    console.debug("getVrtCommand:::", vrt);

    console.debug("--- " + vrt.cmd + " " + vrt.cmdArguments.join(" "));

    execFileAsync(
      vrt.cmd,
      vrt.cmdArguments,
      { shell: true },
      function (error, stdout, stderr) {
        if (error) {
          log(
            "\n\n###vrt command: There seems to be at least one (conversion) error :-/\n" +
              error.message,
            nonce
          );
          if (!localConf.keepFilesForDebugging) {
            execSync(
              "export GLOBIGNORE=*.log &&  rm " +
                localConf.tmpFolder +
                "*" +
                nonce +
                "* 2> /dev/null && export GLOBIGNORE="
            );
          }
          return next(
            new NotFoundError(
              "02: there was something wrong with the request. the error message from the underlying process is: " +
                error.message
            )
          );
        } else {
          try {
            console.debug("will call execTransAsync");
            //   console.debug("translateAndConvertCommandsVrt:::", translateAndConvertCommandsVrt);

            execTransAsync(
              translateAndConvertCommandsVrt,
              docInfos,
              nonce,
              res,
              next
            );
          } catch (error) {
            return next(
              new InternalServerError(
                "03: something went wrong. the error message from the underlying process is: " +
                  error.message
              )
            );
          }
        }
      }
    );
  } else {
    extractMultipageIfNeeded(
      docInfos,
      rebuildCache,
      () => {
        log("### will process " + docInfos.length + " files ", docInfos, nonce);

        createWorldFilesIfNeeded(
          docInfos,
          () => {
            if (docInfos.length == 1) {
              let docInfo = docInfos[0];
              let translateAndConvertCommands = getTranslateAndConvertCommands(
                docInfo,
                nonce,
                width,
                height,
                minX,
                minY,
                maxX,
                maxY,
                transparent
              );

              console.debug(
                "translateAndConvertCommands:::",
                translateAndConvertCommands
              );

              execTransAsync(
                translateAndConvertCommands,
                docInfos,
                nonce,
                res,
                next
              );
            }
          },
          (error) => {
            return next(
              new InternalServerError(
                "04: something went wrong. the error message from the underlying process is:\n" +
                  error.stderr
              )
            );
          }
        );
      },
      (error) => {
        return next(
          new InternalServerError(
            "05: something went wrong. the error message from the underlying process is:" +
              error
          )
        );
      }
    );
  }
}

function execTransAsync(
  translateAndConvertCommands,
  docInfos,
  nonce,
  res,
  next
) {
  console.debug(
    "--- " +
      translateAndConvertCommands.cmdTranslate +
      " " +
      translateAndConvertCommands.translateArguments.join(" ")
  );

  execFileAsync(
    translateAndConvertCommands.cmdTranslate,
    translateAndConvertCommands.translateArguments,
    { cwd: "/app", shell: true },
    function (error) {
      let docInfo = docInfos[0];
      let localConf = getConf(docInfo);
      if (error) {
        log(
          "\n\n### There seems to be at least one (translation) error  :-/\n" +
            error.message,
          nonce
        );

        if (!localConf.keepFilesForDebugging) {
          //No vulnerability possible, since the vars are comming from the config
          execSync(
            "export GLOBIGNORE=*.log &&  rm " +
              localConf.tmpFolder +
              "*" +
              nonce +
              "* 2> /dev/null && export GLOBIGNORE="
          );
        }
        return next(
          new NotFoundError(
            "06: there was something wrong with the request. the error message from the underlying process is: " +
              error.message
          )
        );
      } else {
        //need to do the convert part
        console.debug("+++", translateAndConvertCommands);

        console.debug(
          "--- " +
            translateAndConvertCommands.cmdConvert +
            " " +
            translateAndConvertCommands.convertArguments.join(" ")
        );

        execFileAsync(
          translateAndConvertCommands.cmdConvert,
          translateAndConvertCommands.convertArguments,
          { cwd: "/app" },
          function (error) {
            if (error) {
              log(
                "\n\n### There seems to be at least one (converting) error :-/\n" +
                  error.message,
                nonce
              );
              if (!localConf.keepFilesForDebugging) {
                //No vulnerability possible, since the vars are comming from the config
                execSync(
                  "export GLOBIGNORE=*.log &&  rm " +
                    localConf.tmpFolder +
                    "*" +
                    nonce +
                    "* 2> /dev/null && export GLOBIGNORE="
                );
              }
              return next(
                new NotFoundError(
                  "07: there was something wrong with the request. the error message from the underlying process is: " +
                    error.message
                )
              );
            } else {
              try {
                let img = readFileSync(
                  localConf.tmpFolder + "all.parts.resized" + nonce + ".png"
                );
                let head = {
                  "Content-Type": "image/png",
                };
                if (docInfos.length == 1) {
                  let docInfo = docInfos[0];
                  if (docInfo.currentPage) {
                    head["X-Rasterfari-currentPage"] = docInfo.currentPage;
                  }
                  if (docInfo.numOfPages) {
                    head["X-Rasterfari-numOfPages"] = docInfo.numOfPages;
                  }
                  if (docInfo.origSize) {
                    head["X-Rasterfari-origFileSize"] =
                      docInfo.origFileSize;
                  }
                  if (docInfo.cacheTimestamp) {
                    head["X-Rasterfari-cacheTimestamp"] =
                      docInfo.cacheTimestamp;
                  }
                }
                res.writeHead(200, head);
                res.end(img, "binary");

                if (localConf.speechComments) {
                  execSync("say done");
                }
                log("\n\n### Everything seems to be 200 ok", nonce);
                if (!localConf.keepFilesForDebugging) {
                  //No vulnerability possible, since the vars are comming from the config
                  execSync("rm " + localConf.tmpFolder + "*" + nonce + "*");
                }
                return next();
              } catch (error) {
                return next(
                  new InternalServerError(
                    "08: something went wrong. the error message from the underlying process is:\n" +
                      error.stderr
                  )
                );
              }
            }
          }
        );
      }
    }
  );
}
function respond4GdalProc(req, res, next) {
  var nonce = "_" + Math.floor(Math.random() * 10000000) + "_";
  log(title + "\n### Request:\n\n" + req.headers.host + req.url + "\n", nonce);

  let params;
  try {
    params = extractParamsFromRequest(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request :-/ \n\nHave a look at the logs.");
    return;
  }

  let { format, layers, minX, minY, maxX, maxY } = params;

  let docInfos = getDocInfosFromLayers(layers);
  let docInfo = docInfos[0];
  let localConf = getConf(docInfo);

  let ending = ".asc";
  if (format !== "text/raster.asc") {
    ending = "." + format.split("/")[1];
  }

  const cmdArguments = [
    "-projwin",
    minX,
    minY,
    maxX,
    maxY,
    layers,
    localConf.tmpFolder + nonce + "out" + ending,
  ];
  execFileAsync(
    "gdal_translate",
    cmdArguments,
    { cwd: "/app" },
    function (error) {
      if (error) {
        log(
          "\n\n### There seems to be at least one (conversion) error :-/\n" +
            error.message,
          nonce
        );
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(
          "There seems to be at least one (conversion) error :-/ \n\nHave a look at the logs."
        );
      } else {
        let result = readFileSync(localConf.tmpFolder + nonce + "out" + ending);
        res.writeHead(200, { "Content-Type": format });
        res.end(result);
      }
    }
  );
}
async function extractMultipageIfNeeded(docInfos, rebuildCache, next, error) {
  try {
    for (let i = 0, l = docInfos.length; i < l; i++) {
      let docInfo = docInfos[i];
      docInfo.path = extractMultipage(docInfo, rebuildCache);;
    }
    next();
  } catch (err) {
    error(err);
  }
}

function extractMultipage(docInfo, rebuildCache) {
  let localConf = getConf(docInfo);
  let docPath = docInfo.path;

  let imageName = docPath.replace(regexMultiPage, "");
  if (!existsSync(imageName)) {
    throw new Error("image " + imageName + " does not exist");
  }

  let meta;
  let multipageDir = localConf.cacheFolder + imageName + ".multipage";
  let multipageCacheFile = multipageDir + "/meta.json";
  let cacheLockFile = localConf.cacheFolder + imageName + ".lock";

  if (existsSync(cacheLockFile)) {
    let cacheLock = readFileSync(cacheLockFile);
    while (existsSync(cacheLockFile)) {
      let age = Date.now() - cacheLock;
      if (age > 60000) {
        try {
          execFileSync("rm", [cacheLockFile]);
        } catch (e) {}
      }
      sleep(20);
    }
  }

  let metaFileExists = existsSync(multipageCacheFile);
  if (metaFileExists) {
    meta = JSON.parse(readFileSync(multipageCacheFile));
  }
  let buildCache;
  if (metaFileExists) {
    if (rebuildCache === undefined) {
      let hash = createHash("md5")
        .update(readFileSync(imageName))
        .digest("hex");
      buildCache = hash != meta.origFileHash;
    } else {
      buildCache = rebuildCache;
    }
  } else {
    buildCache = true;
  }

  if (buildCache) {
    let parentDir = localConf.cacheFolder + dirname(imageName);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir);
    }
    try {
      writeFileSync(cacheLockFile, Date.now().toString());

      sleep(1000);
      if (existsSync(multipageDir)) {
        console.debug(
          "multipage dir exists, but no meta.json in it. removing multipage dir",
          multipageDir
        );

        execFileSync("rm", ["-rf", multipageDir]);
      }
      mkdirSync(multipageDir);

      let stats = statSync(imageName);
      let hash = createHash("md5")
        .update(readFileSync(imageName))
        .digest("hex");
      meta = {
        origFile: imageName,
        origFileHash: hash,
        origFileSize: stats.size,
        cacheTimestamp: Date.now(),
      };

      let densitySwitch = localConf.dpi != null ? "-density" : "";
      let densityValue =
        localConf.dpi != null ? localConf.dpi + "x" + localConf.dpi : "";

        const splitArguments = [
        "-quiet",
        "-type",
        "TrueColor",
        densitySwitch,
        densityValue,
        imageName,
        multipageDir + "/%d.tiff",
      ];

      //remove empty strings from array
      const cleanSplitArguments = splitArguments.filter((arg) => arg !== "");

      console.debug(
        "splitArguments without empty args:::",
        cleanSplitArguments
      );
      execFileSync("convert", cleanSplitArguments);

      let numOfPages;
      if (docPath.indexOf(".multipage/") > -1) {
        try {
          let folder = dirname(docPath);
          let fileObjs = readdirSync(folder);
          let tiffs = fileObjs.filter((fo) => fo.endsWith(".tiff"));
          numOfPages = tiffs.length;
        } catch (e) {
          console.warn("error in getNumberOfPages. will setnumPages to 1", e);
          numOfPages = 1;
        }
      } else {
        numOfPages = 1;
      }
      meta.numOfPages = numOfPages;

      writeFileSync(multipageCacheFile, JSON.stringify(meta));
    } catch (e) {
      console.debug("error while splitting multipage", e);
      execFileSync("rm", ["-rf", multipageDir]);
      throw new Error("error while splitting multipage");
    } finally {
      try {
        execFileSync("rm", [cacheLockFile]);
      } catch (e) {}
    }
  }

  Object.assign(docInfo, meta);
  return identifyMultipageImage(docInfo);
}

function createWorldFilesIfNeeded(docInfos, next, error) {
  try {
    for (let i = 0; i < docInfos.length; i++) {
      let docInfo = docInfos[i];
      let docPath = docInfo.path;
      let localConf = getConf(docInfo);
      if (!existsSync(docPath)) {
        continue;
      }

      let docSplit = docPath.split(".");
      let docEnding = docSplit.slice(-1).join(".");
      let worldFileEnding;

      if (docEnding === "tif" || docEnding === "tiff") {
        worldFileEnding = "tfw";
      } else if (docEnding === "jpg" || docEnding === "jpeg") {
        worldFileEnding = "jgw";
      } else if (docEnding === "png") {
        worldFileEnding = "pgw";
      } else if (docEnding === "gif") {
        worldFileEnding = "gfw";
      }

      let worldFile = docSplit
        .reverse()
        .slice(1)
        .reverse()
        .concat(worldFileEnding)
        .join(".");

      let dimensions = String(
        execFileSync("identify", ["-ping", "-format", "'%[w]x%[h]'", docPath])
      );
      let imageWidth = dimensions.split("x")[0];
      let imageHeight = dimensions.split("x")[1];

      //remove leading and trailing quoate characters
      imageWidth = imageWidth.replace(/^['"]+|\s+|\\|\/|['"]+$/g, "");
      imageHeight = imageHeight.replace(/^['"]+|\s+|\\|\/|['"]+$/g, "");

      if (!existsSync(worldFile)) {
        let cachedWorldFile = !worldFile.startsWith(localConf.cacheFolder)
          ? localConf.cacheFolder + worldFile
          : worldFile;

        if (!existsSync(cachedWorldFile)) {
          mkdirSync(dirname(cachedWorldFile));

          let worldFileData = calculateWorldFileData(imageWidth, imageHeight);

          let fd = openSync(cachedWorldFile, "w");

          let buffer = Buffer.from(
            worldFileData.xScale +
              "\n" +
              worldFileData.ySkew +
              "\n" +
              worldFileData.xSkew +
              "\n" +
              worldFileData.yScale +
              "\n" +
              worldFileData.x +
              "\n" +
              worldFileData.y +
              "\n" +
              ""
          );

          writeSync(fd, buffer, 0, buffer.length, null);
          closeSync(fd);

          if (!docPath.startsWith(localConf.cacheFolder)) {
            symlinkSync("/app/" + docPath, localConf.cacheFolder + docPath);
          }

          console.debug("start waiting");
          let fileExists = false;
          let sleepCycles = 0;
          let sleepInterval = 100;
          let maxSleep = 2000;
          while (!fileExists) {
            fileExists = existsSync(cachedWorldFile);
            sleep(sleepInterval);
            if (++sleepCycles * sleepInterval > maxSleep) {
              break;
            }
            if (fileExists) {
              continue;
            }
          }
          console.debug("done waiting");
        }
        if (!docPath.startsWith(localConf.cacheFolder)) {
          docInfos[i] = localConf.cacheFolder + docPath;
        }
      }
    }
    next();
  } catch (err) {
    console.warn("error in createWorldFilesIfNeeded", err);

    error(err);
  }
}

function identifyMultipageImage(docInfo) {
  let localConf = getConf(docInfo);
  let docPath = docInfo.path;

  let imageName;
  let page;
  if (docPath.match(regexMultiPage)) {
    imageName = docPath.replace(regexMultiPage, "");
    page = parseInt(
      String(docPath.match(regexMultiPage, "")).replace(/[\[\]]/, "")
    );
  } else {
    imageName = docPath;
    page = 0;
  }
  docInfo.currentPage = page + 1;

  let multipageDir = localConf.cacheFolder + imageName + ".multipage";
  let inputImage = multipageDir + "/" + page + ".tiff";

  return inputImage;
}

function getDocInfosFromLayers(layers) {
  let docInfos = [];
  let docPerLayer = layers.split(",");
  for (var i = 0, l = docPerLayer.length; i < l; i++) {
    let origPath = docPerLayer[i];
    docInfos[i] = {
      origPath: origPath,
      path: getDocPathFromLayerPart(origPath),
    };
  }

  return docInfos;
}

//either the LAYERS variable contains the the path to the images (seperated by ,) or it comtains a identifier that a custom function can handle
function getDocPathFromLayerPart(layerPart) {
  if (
    customExtensions !== undefined &&
    typeof customExtensions.customConvertLayerPartToDoc === "function"
  ) {
    return customExtensions.customConvertLayerPartToDoc(layerPart);
  } else {
    return layerPart;
  }
}

function getVrtCommand(
  docInfos,
  nonce,
  srs,
  minx,
  miny,
  maxx,
  maxy,
  width,
  height
) {
  let localConf = getConf(docInfo);
  let docInfo = docInfos[0];

  let doclist = "";
  for (var i = 0; i < docInfos.length; i++) {
    doclist = doclist + '"' + docInfos[i].path + '" ';
  }
  if (localConf.sourceSRS === srs) {
    const cmdArguments = [];
    if (localConf.nodata_color) {
      cmdArguments.push("-srcnodata", "'" + localConf.nodata_color + "'");
    }

    const docListArray = doclist.trim().split(" ");

    cmdArguments.push(
      ...[
        "-r",
        "average",
        "-overwrite",
        "-te",
        minx,
        miny,
        maxx,
        maxy,
        localConf.tmpFolder + "all.parts.resized" + nonce + ".vrt",
        ...docListArray,
      ]
    );
    return { cmd: "gdalbuildvrt", cmdArguments };
  } else {
    const cmdArguments = [];
    if (localConf.nodata_color) {
      cmdArguments.push("-srcnodata", "'" + localConf.nodata_color + "'");
    }
    const docListArray = doclist.trim().split(" ");

    cmdArguments.push(
      ...[
        "-dstalpha",
        "-r ",
        localConf.interpolation,
        "-overwrite",
        "-s_srs ",
        localConf.sourceSRS,
        "-te",
        minx,
        miny,
        maxx,
        maxy,
        "-t_srs",
        srs,
        "-ts",
        width,
        height,
        "-of",
        "GTiff",
        ...docListArray,
        localConf.tmpFolder + "all.parts.resized" + nonce + ".tif",
      ]
    );

    return { cmd: "gdalwarp", cmdArguments };
  }
}

function getTranslateAndConvertCommandsVrt(docInfos, nonce, width, height) {
  let localConf = getConf(docInfo);
  let docInfo = docInfos[0];

  const translateArguments = [];

  if (localConf.nodata_color) {
    translateArguments.push("-a_nodata", "'" + localConf.nodata_color + "'");
  }

  translateArguments.push(
    ...[
      "-q",
      "-outsize",
      width,
      height,
      "--config",
      "GDAL_PAM_ENABLED",
      "NO",
      "-of",
      "png",
      //   ...intermediateFiles,
      localConf.tmpFolder + "all.parts.resized" + nonce + ".*",
      localConf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png",
    ]
  );

  const convertArguments = [
    "-background",
    "none",
    localConf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png",
    "PNG32:" + localConf.tmpFolder + "all.parts.resized" + nonce + ".png",
  ];
  return {
    cmdTranslate: "gdal_translate",
    translateArguments,
    cmdConvert: "convert",
    convertArguments,
  };
}

function getTranslateAndConvertCommands(
  docInfo,
  nonce,
  width,
  height,
  minx,
  miny,
  maxx,
  maxy,
  transparent
) {
  let localConf = getConf(docInfo);
  let docPath = docInfo.path;

  const translateArguments = [];
  if (localConf.nodata_color) {
    translateArguments.push("-a_nodata", "'" + localConf.nodata_color + "'");
  }
  translateArguments.push(
    ...[
      "-q",
      "-outsize",
      width,
      height,
      "--config",
      "GDAL_PAM_ENABLED",
      "NO",
      "-projwin",
      minx,
      maxy,
      maxx,
      miny,
      "-of",
      "png",
      "'" + docPath + "'",
      localConf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png",
    ]
  );

  const convertArguments = [
    transparent == true ? "-background" : "-alpha",
    transparent == true ? "none" : "remove",
    localConf.tmpFolder + "all.parts.resized" + nonce + "intermediate.png",
    "PNG32:" + localConf.tmpFolder + "all.parts.resized" + nonce + ".png",
  ];

  return {
    cmdTranslate: "gdal_translate",
    translateArguments,
    cmdConvert: "convert",
    convertArguments,
  };
}

function calculateWorldFileData(imageWidth, imageHeight) {
  // CENTER
  let xul = imageWidth > imageHeight ? -0.5 : imageWidth / imageHeight / -2;
  let yul = imageWidth > imageHeight ? imageHeight / imageWidth / 2 : 0.5;
  let xlr = imageWidth > imageHeight ? 0.5 : imageWidth / imageHeight / 2;
  let ylr = imageWidth > imageHeight ? imageHeight / imageWidth / -2 : -0.5;

  let xScale = (xlr - xul) / imageWidth; // x-component of the pixel width (x-scale)
  let ySkew = 0; // y-component of the pixel width (y-skew)
  let xSkew = 0; // x-component of the pixel height (x-skew)
  let yScale = (ylr - yul) / imageHeight; // y-component of the pixel height (y-scale), typically negative
  let x = xul + xScale * 0.5; // x-coordinate of the center of the upper left pixel
  let y = yul + yScale * 0.5; // y-coordinate of the center of the upper left pixel

  return {
    xScale: xScale,
    ySkew: ySkew,
    xSkew: xSkew,
    yScale: yScale,
    x: x,
    y: y,
  };
}

var server = createServer();
const cors = corsMiddleware({
  origins: globalConf.corsAccessControlAllowOrigins,
});

server.pre(cors.preflight);
server.use(cors.actual);
server.use(plugins.acceptParser(server.acceptable));
server.use(plugins.queryParser());
server.use(plugins.bodyParser());

if (globalConf.geoDocWMSCoreActive === true) {
  server.get("/geoDocWMS/", respond);
  server.get("/rasterfariWMS/", respond);
}
if (globalConf.gdalProcessorCoreActive === true) {
  server.get("/gdalProcessor/", respond4GdalProc);
}

if (globalConf.geoDocWMSCoreActive === true) {
  server.head("/geoDocWMS/", respond);
  server.head("/rasterfariWMS/", respond);
}
if (globalConf.gdalProcessorCoreActive === true) {
  server.head("/gdalProcessor/", respond4GdalProc);
}

server.pre(pre.userAgentConnection());
console.info("Listening on port:" + globalConf.port);

server.listen(globalConf.port, globalConf.host);
