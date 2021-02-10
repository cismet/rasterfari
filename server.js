let title = '';
title += '               _             __            _' + '\n';
title += ' _ __ __ _ ___| |_ ___ _ __ / _| __ _ _ __(_)' + '\n';
title += "| '__/ _` / __| __/ _  '__| |_ / _` | '__| |" + '\n';
title += '| | | (_| __  ||  __/ |  |  _| (_| | |  | |' + '\n';
title += '|_|  __,_|___/_____|_|  |_|  __,_|_|  |_|' + '\n';

const restify = require('restify');
const errors = require('restify-errors');
const execSync = require('child_process').execSync;
const execAsync = require('child_process').exec;
//const async = require('async');
const spawnSync = require('child_process').spawnSync;
const fx = require('mkdir-recursive');
const path = require('path');
const readChunk = require('read-chunk');
const fileType = require('file-type');

const sleep = (ms) => spawnSync(process.argv[0], [ '-e', 'setTimeout(function(){},' + ms + ')' ]);
const extConf = require('./config.json');
const corsMiddleware = require('restify-cors-middleware');

const fs = require('fs');
if (extConf.customExtensions !== undefined) {
	var customExtensions = require(extConf.customExtensions);
	// console.log("custom extensions loaded from " + configuration.custom);
} else {
	//console.log("no custom extensions loaded");
}

let defaultConf = {
	port: 8081,
	host: '0.0.0.0',
	workers: 1,
	tmpFolder: './tmp/',
	cacheFolder: './cache/',
	keepFilesForDebugging: false,
	speechComments: false,
	tolerantMode: false,
	sourceSRS: 'EPSG:25832',
	nodata_color: '249 249 249',
	interpolation: 'average',
	geoTif: true,
	dpi: null,
	corsAccessControlAllowOrigins: [ 'http://localhost:*', 'https://rasterfari.cismet.de' ]
};

var globalConf = getConf();
var globalDirConfs = {};
var chachedLocalDirConfs = {};

if (fs.existsSync('./dirConfigs.json')) {
	globalDirConfs = JSON.parse(fs.readFileSync('./dirConfigs.json'));
}

if (!fs.existsSync(globalConf.tmpFolder)) {
	fs.mkdirSync(globalConf.tmpFolder);
}
if (!fs.existsSync(globalConf.cacheFolder)) {
	fs.mkdirSync(globalConf.cacheFolder);
}

function log(message, nonce) {
	fs.appendFile(
		globalConf.tmpFolder + 'processing_of_' + nonce + '.log',
		message + '\n',
		(error) => {
			if (error) {
				console.log('Problem during log write');
			}
		}
	);
	console.log(message);
}

function getConf(docInfo) {
	let dirConf = {};

	if (docInfo) {
		let docDir = path.dirname(docInfo.origPath);
		let docSplit = docDir.split('/');
		for (let i = 0; i < docSplit.length; i++) {
			let dir = docSplit.slice(0, i + 1).join('/');
			let dirConfFile = dir + '/config.json';
			//console.log("CONF " + i + ": " + dirConfFile);

			if (chachedLocalDirConfs[dir] === undefined) {
				if (fs.existsSync(dirConfFile)) {
					chachedLocalDirConfs[dir] = JSON.parse(fs.readFileSync(dirConfFile));
				}
			}
			dirConf = Object.assign(dirConf, globalDirConfs[dir], chachedLocalDirConfs[dir]);
		}
	}
	let conf = Object.assign({}, defaultConf, extConf, dirConf);
	//console.log(conf);
	return conf;
}

const regexMultiPage = /\[\d+\]$/;

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
		req.query.customScale || req.query.CUSTOMSCALE || req.query.customscale || '1';
	let customScaleX =
		req.query.customScaleX || req.query.CUSTOMSCALEX || req.query.customscalex || customScale;
	let customScaleY =
		req.query.customScaleY || req.query.CUSTOMSCALEY || req.query.customscaley || customScale;
	let customOffsetX =
		req.query.customOffsetX || req.query.CUSTOMOFFSETX || req.query.customoffsetx || '0';
	let customOffsetY =
		req.query.customOffsetX || req.query.CUSTOMOFFSETY || req.query.customoffsety || '0';

	if (bbox) {
		var sbbox = bbox.split(',');
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
	let service = req.query.SERVICE || req.query.service || req.query.Service || 'WMS';
	let request = req.query.REQUEST || req.query.request || req.query.Request || 'GetMap';
	let format = req.query.FORMAT || req.query.format || req.query.Format || 'image/png';

	console.log({
		service,
		request,
		format,
		layers,
		width,
		height,
		minX,
		minY,
		maxX,
		maxY,
		srs,
		srcSrs,
		customDocumentInfo
	});
	return {
		service,
		request,
		format,
		layers,
		width,
		height,
		minX,
		minY,
		maxX,
		maxY,
		srs,
		srcSrs,
		customDocumentInfo
	};
}

function respond(req, res, next) {
	var nonce = '_' + Math.floor(Math.random() * 10000000) + '_';
	log(title + '\n### Request:\n\n' + req.headers.host + req.url + '\n', nonce);

	let {
		layers,
		width,
		height,
		minX,
		minY,
		maxX,
		maxY,
		srs,
		customDocumentInfo
	} = extractParamsFromRequest(req);

	let docInfos = getDocInfosFromLayers(layers);
	let docInfo = docInfos[0];
	let docPath = docInfo.path;
	let localConf = getConf(docInfo);

	if (
		(docInfos.length == 1 && customDocumentInfo === 'Download') ||
		customDocumentInfo === 'download' ||
		customDocumentInfo === 'DOWNLOAD'
	) {
		fs.readFile(docPath, (error, data) => {
			if (error) {
				log(error);
				return next(
					new errors.NotFoundError(
						'there was something wrong with the request. the error message from the underlying process is: ' +
							error.message
					)
				);
			} else {
				let buffer = readChunk.sync(docPath, 0, 4100);
				if (fileType(buffer) !== null) {
					let mime = fileType(buffer).mime;
					res.writeHead(200, { 'Content-Type': mime });
				}
				res.end(data, 'binary');
			}
		});
		return;
	}

	if (localConf.geoTif) {
		let vrt = getVrtCommand(docInfos, nonce, srs, minX, minY, maxX, maxY, width, height);
		let trans = getTranslateCommandVrt(docInfos, nonce, width, height);

		console.log('\n\n\n');
		console.log(':::' + vrt);
		console.log('\n');
		console.log(':::' + trans);
		console.log('\n\n\n');

		execAsync(vrt, function(error, stdout, stderr) {
			if (error) {
				log(
					'\n\n### There seems to be at least one (conversion) error :-/\n' +
						error.message,
					nonce
				);
				if (!localConf.keepFilesForDebugging) {
					execSync(
						'export GLOBIGNORE=*.log &&  rm ' +
							localConf.tmpFolder +
							'*' +
							nonce +
							'* 2> /dev/null && export GLOBIGNORE='
					);
				}
				return next(
					new errors.NotFoundError(
						'there was something wrong with the request. the error message from the underlying process is: ' +
							error.message
					)
				);
			} else {
				try {
					execTransAsync(trans, docInfos, nonce, res, next);
				} catch (error) {
					return next(
						new errors.InternalServerError(
							'something went wrong. the error message from the underlying process is: ' +
								error.message
						)
					);
				}
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
		//                 return next(new errors.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + error.message));
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
		//         return next(new errors.NotFoundError("there was something wrong with the request. the error message from the underlying process is: " + err.message));
		//     }
		// });
	} else {
		extractMultipageIfNeeded(
			docInfos,
			() => {
				log('### will process ' + docInfos.length + ' files (' + docInfos + ')\n', nonce);

				createWorldFilesIfNeeded(
					docInfos,
					() => {
						if (docInfos.length == 1) {
							let docInfo = docInfos[0];
							let trans = getTranslateCommand(
								docInfo,
								nonce,
								width,
								height,
								minX,
								minY,
								maxX,
								maxY
							);

							console.log('\n\n\n');
							console.log(':::' + trans);
							console.log('\n\n\n');

							execTransAsync(trans, docInfos, nonce, res, next);
						}
					},
					(error) => {
						return next(
							new errors.InternalServerError(
								'something went wrong. the error message from the underlying process is:\n' +
									error.stderr
							)
						);
					}
				);
			},
			(error) => {
				return next(
					new errors.InternalServerError(
						'something went wrong. the error message from the underlying process is:\n' +
							error.stderr
					)
				);
			}
		);
	}
}

function execTransAsync(trans, docInfos, nonce, res, next) {
	execAsync(trans, function(error) {
		let docInfo = docInfos[0];
		let localConf = getConf(docInfo);
		if (error) {
			log(
				'\n\n### There seems to be at least one (conversion) error :-/\n' + error.message,
				nonce
			);
			if (!localConf.keepFilesForDebugging) {
				execSync(
					'export GLOBIGNORE=*.log &&  rm ' +
						localConf.tmpFolder +
						'*' +
						nonce +
						'* 2> /dev/null && export GLOBIGNORE='
				);
			}
			return next(
				new errors.NotFoundError(
					'there was something wrong with the request. the error message from the underlying process is: ' +
						error.message
				)
			);
		} else {
			try {
				let img = fs.readFileSync(
					localConf.tmpFolder + 'all.parts.resized' + nonce + '.png'
				);
				let head = {
					'Content-Type': 'image/png'
				};
				if (docInfos.length == 1) {
					let docInfo = docInfos[0];
					if (docInfo.numOfPages) {
						head['X-Rasterfari-numOfPages'] = docInfo.numOfPages;
					}
					if (docInfo.currentPage) {
						head['X-Rasterfari-currentPage'] = docInfo.currentPage;
					}
					if (docInfo.pageHeight) {
						head['X-Rasterfari-pageHeight'] = docInfo.pageHeight;
					}
					if (docInfo.pageWidth) {
						head['X-Rasterfari-pageWidth'] = docInfo.pageWidth;
					}
					if (docInfo.fileSize) {
						head['X-Rasterfari-fileSize'] = docInfo.fileSize;
					}
				}
				res.writeHead(200, head);
				res.end(img, 'binary');

				if (localConf.speechComments) {
					execSync('say done');
				}
				log('\n\n### Everything seems to be 200 ok', nonce);
				if (!localConf.keepFilesForDebugging) {
					execSync('rm ' + localConf.tmpFolder + '*' + nonce + '*');
				}
				return next();
			} catch (error) {
				return next(
					new errors.InternalServerError(
						'something went wrong. the error message from the underlying process is:\n' +
							error.stderr
					)
				);
			}
		}
	});
}
function respond4GdalProc(req, res, next) {
	var nonce = '_' + Math.floor(Math.random() * 10000000) + '_';
	log(title + '\n### Request:\n\n' + req.headers.host + req.url + '\n', nonce);

	let {
		service,
		request,
		format,
		layers,
		width,
		height,
		minX,
		minY,
		maxX,
		maxY,
		srs,
		srcSrs
	} = extractParamsFromRequest(req);
	let docInfos = getDocInfosFromLayers(layers);
	let docInfo = docInfos[0];
	let docPath = docInfo.path;
	let localConf = getConf(docInfo);

	let ending = '.asc';
	if (format !== 'text/raster.asc') {
		ending = '.' + format.split('/')[1];
	}

	let cmd =
		`gdal_translate ` +
		`-projwin ${minX} ${minY} ${maxX} ${maxY} ` +
		`${layers} ` +
		`${localConf.tmpFolder + nonce + 'out' + ending}`;
	console.log('cmd', cmd);
	console.log('conf', localConf);
	execAsync(cmd, function(error) {
		if (error) {
			log(
				'\n\n### There seems to be at least one (conversion) error :-/\n' + error.message,
				nonce
			);
		} else {
			let result = fs.readFileSync(localConf.tmpFolder + nonce + 'out' + ending);
			res.writeHead(200, { 'Content-Type': format });
			res.end(result);
		}
	});
}
async function extractMultipageIfNeeded(docInfos, next, error) {
	try {
		for (let i = 0, l = docInfos.length; i < l; i++) {
			let docInfo = docInfos[i];
			let docPath = docInfo.path;
			if (regexMultiPage.test(docPath)) {
				docPath = extractMultipage(docInfo);
			} else {
				//let buffer = readChunk.sync(doc, 0, 4100);
				//let type = fileType(buffer).ext;

				//if (type === "pdf") {
				//let numOfPages = String(execSync("pdfinfo " + doc + " | grep -a Pages: | awk '{print $2}'"));
				//if (numOfPages > 1) {
				docPath = extractMultipage(docInfo);
				//}
				//} else {
				// multipage tiff ?? (TODO)
				//}
			}

			docInfo.path = docPath;

			let numOfPages;
			if (docPath.indexOf('.multipage/') > -1) {
				let cmd = 'ls -1 $(dirname "' + docPath + '")/*.tiff | wc -l';
				numOfPages = parseInt(String(execSync(cmd)).trim());
			} else {
				numOfPages = 1;
			}

			docInfo.path = docPath;
			docInfo.numOfPages = numOfPages;
		}

		next();
	} catch (err) {
		error(err);
	}
}

function extractMultipage(docInfo) {
	let localConf = getConf(docInfo);
	let docPath = docInfo.path;

	let imageName = docPath.replace(regexMultiPage, '');
	let multipageDir = localConf.cacheFolder + imageName + '.multipage';

	if (!fs.existsSync(multipageDir)) {
		let density =
			localConf.dpi != null ? '-density ' + localConf.dpi + 'x' + localConf.dpi + ' ' : '';
		let splitPagesCmd = 'convert ' + density + imageName + ' ' + multipageDir + '/%d.tiff';

		fx.mkdirSync(multipageDir);
		console.log(':::' + splitPagesCmd);
		execSync(splitPagesCmd);
	}
	return identifyMultipageImage(docInfo);
}

function createWorldFilesIfNeeded(docInfos, next, error) {
	try {
		for (let i = 0; i < docInfos.length; i++) {
			let docInfo = docInfos[i];
			let docPath = docInfo.path;
			let localConf = getConf(docInfo);
			if (!fs.existsSync(docPath)) {
				continue;
			}

			let docSplit = docPath.split('.');
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

			let imageSize = String(execSync("identify -ping -format '%[w]x%[h]' " + docPath));
			let imageWidth = imageSize.split('x')[0];
			let imageHeight = imageSize.split('x')[1];

			docInfo['pageWidth'] = imageWidth;
			docInfo['pageHeight'] = imageHeight;

			if (!fs.existsSync(worldFile)) {
				let cachedWorldFile = !worldFile.startsWith(localConf.cacheFolder)
					? localConf.cacheFolder + worldFile
					: worldFile;

				if (!fs.existsSync(cachedWorldFile)) {
					fx.mkdirSync(path.dirname(cachedWorldFile));

					let worldFileData = calculateWorldFileData(imageWidth, imageHeight);

					let fd = fs.openSync(cachedWorldFile, 'w');

					let buffer = new Buffer(
						worldFileData.xScale +
							'\n' +
							worldFileData.ySkew +
							'\n' +
							worldFileData.xSkew +
							'\n' +
							worldFileData.yScale +
							'\n' +
							worldFileData.x +
							'\n' +
							worldFileData.y +
							'\n' +
							''
					);

					fs.writeSync(fd, buffer, 0, buffer.length, null);
					fs.closeSync(fd);

					if (!docPath.startsWith(localConf.cacheFolder)) {
						fs.symlinkSync('/app/' + docPath, localConf.cacheFolder + docPath);
					}

					console.log('start waiting');
					let fileExists = false;
					let sleepCycles = 0;
					let sleepInterval = 100;
					let maxSleep = 2000;
					while (!fileExists) {
						fileExists = fs.existsSync(cachedWorldFile);
						sleep(sleepInterval);
						if (++sleepCycles * sleepInterval > maxSleep) {
							break;
						}
						if (fileExists) {
							continue;
						}
					}
					console.log('done waiting');

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
				if (!docPath.startsWith(localConf.cacheFolder)) {
					docInfos[i] = localConf.cacheFolder + docPath;
				}
			}
		}
		next();
	} catch (err) {
		error(err);
	}
}

function identifyMultipageImage(docInfo) {
	let localConf = getConf(docInfo);
	let docPath = docInfo.path;

	let imageName;
	let page;
	if (docPath.match(regexMultiPage)) {
		imageName = docPath.replace(regexMultiPage, '');
		page = parseInt(String(docPath.match(regexMultiPage, '')).replace(/[\[\]]/, ''));
	} else {
		imageName = docPath;
		page = 0;
	}
	docInfo.currentPage = page + 1;

	let multipageDir = localConf.cacheFolder + imageName + '.multipage';
	let inputImage = multipageDir + '/' + page + '.tiff';

	return inputImage;
}

function getDocInfosFromLayers(layers) {
	let docInfos = [];
	let docPerLayer = layers.split(',');
	for (var i = 0, l = docPerLayer.length; i < l; i++) {
		let origPath = docPerLayer[i];
		let imageName = origPath.replace(regexMultiPage, '');
		let fileSizeInBytes;
		if (fs.existsSync(imageName)) {
			let stats = fs.statSync(imageName);
			fileSizeInBytes = stats.size;
		} else {
			fileSizeInBytes = -1;
		}

		docInfos[i] = {
			origPath: origPath,
			path: getDocPathFromLayerPart(origPath),
			fileSize: fileSizeInBytes
		};
	}

	return docInfos;
}

//either the LAYERS variable contains the the path to the images (seperated by ,) or it comtains a identifier that a custom function can handle
function getDocPathFromLayerPart(layerPart) {
	if (
		customExtensions !== undefined &&
		typeof customExtensions.customConvertLayerPartToDoc === 'function'
	) {
		return customExtensions.customConvertLayerPartToDoc(layerPart);
	} else {
		return layerPart;
	}
}

function getVrtCommand(docInfos, nonce, srs, minx, miny, maxx, maxy, width, height) {
	let localConf = getConf(docInfo);
	let docInfo = docInfos[0];

	let doclist = '';
	for (var i = 0; i < docInfos.length; i++) {
		doclist = doclist + docInfos[i].path + ' ';
	}
	if (localConf.sourceSRS === srs) {
		return (
			'gdalbuildvrt ' +
			(localConf.nodata_color ? "-srcnodata '" + localConf.nodata_color + "' " : '') +
			'-r average -overwrite ' +
			'-te ' +
			minx +
			' ' +
			miny +
			' ' +
			maxx +
			' ' +
			maxy +
			' ' +
			localConf.tmpFolder +
			'all.parts.resized' +
			nonce +
			'.vrt ' +
			doclist
		);
	} else {
		let cmd =
			'gdalwarp ' +
			(localConf.nodata_color ? "-srcnodata '" + localConf.nodata_color + "' " : '') +
			'-dstalpha ' +
			'-r ' +
			localConf.interpolation +
			' ' +
			'-overwrite ' +
			'-s_srs ' +
			localConf.sourceSRS +
			' ' +
			'-te ' +
			minx +
			' ' +
			miny +
			' ' +
			maxx +
			' ' +
			maxy +
			' ' +
			'-t_srs ' +
			srs +
			' ' +
			'-ts ' +
			width +
			' ' +
			height +
			' ' +
			'-of GTiff ' +
			doclist +
			' ' +
			localConf.tmpFolder +
			'all.parts.resized' +
			nonce +
			'.tif ';
		return cmd;
	}
}

function getTranslateCommandVrt(docInfos, nonce, width, height) {
	let localConf = getConf(docInfo);
	let docInfo = docInfos[0];

	return (
		'gdal_translate ' +
		(localConf.nodata_color ? "-a_nodata '" + localConf.nodata_color + "' " : '') +
		'-q ' +
		'-outsize ' +
		width +
		' ' +
		height +
		' ' +
		'--config GDAL_PAM_ENABLED NO ' +
		'-of png ' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'.* ' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'intermediate.png ' +
		'&& convert -background none ' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'intermediate.png ' +
		'PNG32:' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'.png '
	);
}

function getTranslateCommand(docInfo, nonce, width, height, minx, miny, maxx, maxy) {
	let localConf = getConf(docInfo);
	let docPath = docInfo.path;
	return (
		'gdal_translate ' +
		(localConf.nodata_color ? "-a_nodata '" + localConf.nodata_color + "' " : '') +
		'-q ' +
		'-outsize ' +
		width +
		' ' +
		height +
		' ' +
		'--config GDAL_PAM_ENABLED NO ' +
		'-projwin ' +
		minx +
		' ' +
		maxy +
		' ' +
		maxx +
		' ' +
		miny +
		' ' +
		'-of png ' +
		docPath +
		' ' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'intermediate.png ' +
		'&& convert -background none ' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'intermediate.png ' +
		'PNG32:' +
		localConf.tmpFolder +
		'all.parts.resized' +
		nonce +
		'.png '
	);
}

function calculateWorldFileData(imageWidth, imageHeight) {
	/*  // UPPER LEFT
        let xul = 0;
        let yul = 1;
        let xlr = (imageWidth > imageHeight) ? imageHeight / imageWidth : imageWidth / imageHeight;
        let ylr = 0;
    */

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

	return { xScale: xScale, ySkew: ySkew, xSkew: xSkew, yScale: yScale, x: x, y: y };
}

function createWarpTask(nonce, originalDoc, doclist, srs, minx, miny, maxx, maxy, width, height) {
	return function(callback) {
		if (conf.speechComments) {
			execAsync('say go');
		}
		var cmd =
			'gdalwarp ' +
			(conf.nodata_color ? "-srcnodata '" + conf.nodata_color + "' " : '') +
			'-dstalpha ' +
			'-r ' +
			conf.interpolation +
			' ' +
			'-overwrite ' +
			'-s_srs ' +
			conf.sourceSRS +
			' ' +
			'-te ' +
			minx +
			' ' +
			miny +
			' ' +
			maxx +
			' ' +
			maxy +
			' ' +
			'-t_srs ' +
			srs +
			' ' +
			'-ts ' +
			width +
			' ' +
			height +
			' ' +
			doclist +
			' ' +
			conf.tmpFolder +
			'all.parts.resized' +
			nonce +
			'.tif ';
		log(cmd, nonce);
		execAsync(cmd, null, function(error, stdout, stderr) {
			if (error) {
				if (!conf.tolerantMode) {
					callback(new Error('failed getting something:' + error.message));
				} else {
					log(
						'\n\n### There seems to be an error :-/ Will ignore because of the tolerantMode\n' +
							error.message,
						nonce
					);
					callback(null, true);
				}
			} else {
				callback(null, true);
			}
		});
	};
}

var server = restify.createServer();
const cors = corsMiddleware({
	origins: globalConf.corsAccessControlAllowOrigins
});

server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());

server.get('/geoDocWMS/', respond);
server.get('/rasterfariWMS/', respond);
server.get('/gdalProcessor/', respond4GdalProc);

server.head('/geoDocWMS/', respond);
server.head('/rasterfariWMS/', respond);
server.head('/gdalProcessor/', respond4GdalProc);

server.pre(restify.pre.userAgentConnection());
console.log('Listening on port:' + globalConf.port);

server.listen(globalConf.port, globalConf.host);
