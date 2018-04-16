const { execSync, exec } = require('child_process');
const {long2tile, lat2tile, tile2long, tile2lat} = require('xyztile')
const fse = require('fs-extra')

var GDAL_INFO = "D:\\OSGeo4W64\\bin\\gdalinfo.exe"
var GDAL_TRANSLATE = "D:\\OSGeo4W64\\bin\\gdal_translate.exe"
// var TIFF_PATH = "D:\\_temp\\istan_rect\\t_1.tif"
var TIFF_PATH = "D:\\_temp\\istan_rect\\testshape.tif"
var ROOT_FOLDER = 'D:\\_temp\\istan_rect\\istanbul_rect\\'

var MAX_LEVEL = 16
var TIF_EXTEND
var startZoom = 16
var abort = false

var randomDebug = Math.round(Math.random() * 9999)
var debugPath = `D://debug.txt`
async function start() {

    let header = 'tile_x;tile_y;tile_z;geom'
    // fse.ensureFileSync(debugPath)
    // fse.appendFileSync(debugPath, header + '\n')

    let command = [
        GDAL_INFO,
        TIFF_PATH,
        "-json"
    ]

    exec(command.join(' '), (err, stdout, stderr) => {
    
        if (err) {
            console.log("\033[31m ERROR \033");
            console.error(err);
          return;
        }

        
        let infoData = JSON.parse(stdout)
        let cornerCoordinates = infoData.cornerCoordinates

        let coordinates = infoData.wgs84Extent.coordinates
        let upperLeft   = coordinates[0][0]
        let lowerLeft   = coordinates[0][1]
        let lowerRight  = coordinates[0][2]
        let upperRight  = coordinates[0][3]

        // console.log(`WGS84 Extent : ${upperLeft} ${lowerLeft} ${lowerRight} ${upperRight}`);

        let ulX = upperLeft[0]
        let ulY = upperLeft[1]

        let lrX = lowerRight[0]
        let lrY = lowerRight[1]

        TIF_EXTEND = { 
            west : ulX,
            east : lrX,
            north : ulY,
            south : lrY,
        }

        var level = startZoom
        let tileCountX = zoomToTileCount(level)
        let tileCountY = zoomToTileCount(level) / 2

        let tileStartX = long2tile(ulX, level)
        let tileEndX = long2tile(lrX, level) + 1
        
        let tileStartY = lat2tile(ulY, level) + 1
        let tileEndY = lat2tile(lrY,level) 

        console.log(TIF_EXTEND);
        
        let pStart = {x: tileStartX , y:tileStartY}
        let pEnd = {x: tileEndX , y: tileEndY}
        
        
        var levels = {}

        levels[level] = []
        
        
        for (let i = tileStartX; i <= tileEndX; i++) {
            
            for (let j = tileEndY; j <= tileStartY; j++) {
        
                let xt = tile2long(i, level)
                let yt = tile2lat(j, level)

                let ext = tile2long(i + 1, level)
                let eyt = tile2lat(j + 1, level)

                let o = {
                    west : xt,
                    east : ext,
                    north : yt,
                    south : eyt,
                    x : long2tile(xt, level),
                    y : lat2tile(yt, level),
                    level : level,
                } 

                levels[level].push(o)

            }
        }
       
        
        createTiles(levels, level)
        
        var fullData = []
        
        for (const key in levels) {
            
            const l = levels[key]
            for (let i = 0; i < l.length; i++) {
                const item = l[i]; 
               
                if(isIntersect(item)) {
                    fullData.push(item)
                    boundsToWKT(item)
                }
                
                
            }
        }

        console.log('Total Tile Length : ' , fullData.length);
        
        startProgress(fullData)
        
    })

}

start();


function isIntersect(item) {
    
    if(item.west < TIF_EXTEND.west && item.east < TIF_EXTEND.west) {
        return false
    }

    if(item.east > TIF_EXTEND.east && item.west > TIF_EXTEND.east) {
        return false
    }

    if(item.north > TIF_EXTEND.north && item.south > TIF_EXTEND.north) {
        return false
    }

    if(item.south < TIF_EXTEND.south && item.north < TIF_EXTEND.south) {
        return false
    }

    return true
}


async function startProgress(fullData) {
    
    const time = process.hrtime();

    var size = 100
    for (let i = 0; i < fullData.length; i+=size) {
        
        let sizes = []        
        for (let j = i; j < i + size; j++) {
            const element = fullData[j]
            sizes.push(extractTiff(element))
        }
        // const element = fullData[i]
        // let a = await extractTiff(element)
        let data = await Promise.all(sizes)

        if(abort) {
            break
        }
        process.stdout.write("Loading : %" + Math.round((i / fullData.length) * 100) + '\r' + 'processed : ' + i + '\n');
    }


    const diff = process.hrtime(time);
    const NS_PER_SEC = 1e9;
    console.log(`Benchmark took ${diff[0] * NS_PER_SEC + diff[1]} nanoseconds`);
}


function extractTiff(data) {
    
    return new Promise((resolve, reject) => {


        let west = data.west
        let east = data.east
        let north = data.north
        let south = data.south
    
        var EXPORT_PATH = ROOT_FOLDER +  data.level + '\\' + data.x + '\\'
    
        fse.ensureDirSync(EXPORT_PATH)
    
        EXPORT_PATH = EXPORT_PATH + data.y + '.tif'

        if(fse.existsSync(EXPORT_PATH)) {
            resolve(1)
            return
        }

    
        let boundBox = west + ' ' + south + ' ' + east + ' ' + north

        let command = [
            GDAL_TRANSLATE,
            "-of GTiff",
            `-projwin ${boundBox}`,
            '-outsize 256 256',
            TIFF_PATH,
            EXPORT_PATH
         ]
    
         exec(command.join(' '), function (err, stdout, stderr) {

            if(err) {
                abort = true
                reject()
                console.error('Error : ' , err);
                return
            }
            
            let infoCommand = [
                GDAL_INFO,
                EXPORT_PATH,
                "-json",
                "-mm",
                // "-approx_stats",
                // "-norat",
                // "-stats"
            ]

            exec(infoCommand.join(' '), function (err, stdout, stderr) {
                
                if(err) {
                    abort = true
                    reject()
                    console.error('Error : ' , err);
                    return
                }
                let infoData = JSON.parse(stdout)
                if(infoData.bands.length === 0 || (infoData.bands[0].computedMin === undefined && infoData.bands[0].computedMax === undefined )) {
                    fse.removeSync(EXPORT_PATH)
                    // fse.removeSync(EXPORT_PATH + ".aux.xml")
                }
                resolve(2)
            })

            
         })

    })
  
}


function createTiles(levels, currentLevel) {
    
    // if(currentLevel >= 18) return
    if(currentLevel >= MAX_LEVEL) return

    let ar = levels[currentLevel]

    for (let i = 0; i < ar.length; i++) {
        const e = ar[i];

        let centerX = e.west + ((e.east - e.west) / 2)
        let centerY = e.south + ((e.north - e.south) / 2)

        let newLevel = currentLevel + 1

        if(levels[newLevel] === undefined){
            levels[newLevel] = []
        }
        
        levels[newLevel].push( {west : e.west , east : centerX, north : e.north, south : centerY, x : long2tile(e.west, newLevel), y : lat2tile(e.north, newLevel), level : newLevel }) // up left
        levels[newLevel].push( {west : e.west , east : centerX, north : centerY, south : e.south, x : long2tile(e.west, newLevel), y : lat2tile(centerY, newLevel), level : newLevel }) // down left
        levels[newLevel].push( {west : centerX, east : e.east,  north : e.north, south : centerY, x : long2tile(centerX, newLevel), y : lat2tile(e.north, newLevel), level : newLevel })
        levels[newLevel].push( {west : centerX, east : e.east,  north : centerY, south : e.south, x : long2tile(centerX, newLevel), y : lat2tile(centerY, newLevel), level : newLevel  })
       
    }

    createTiles(levels, currentLevel + 1)
}


function boundsToWKT(item) {
    
    let west = item.west
    let east = item.east
    let north = item.north
    let south = item.south
    let x = item.x
    let y = item.y
    let z = item.level


    let p1 = { x: west, y : north}
    let p2 = { x: east, y : north}
    let p3 = { x: east, y : south}
    let p4 = { x: west, y : south}

    let wktTXT = wkt(p1, p2, p3, p4)

    // fse.ensureFileSync(debugPath)
    // fse.appendFileSync(debugPath, x +';'+ y +';'+ z + ';'+  wktTXT + '\n')

}


function wkt(p1, p2, p3, p4) {
    
    var str = `POLYGON((${p1.x} ${p1.y},${p2.x} ${p2.y},${p3.x} ${p3.y},${p4.x} ${p4.y},${p1.x} ${p1.y}))`

   // console.log(str);
    return str
    
}


function zoomToTileCount(zoom) {

    if(zoom === 0) return 1
    let tileCount = 1 << zoom
    return tileCount
}




