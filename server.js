// Load required libraries
var express = require('express');
var path = require("path");
var fs = require('fs');
var sql = require("mssql");

// Command line arguments
// command line: npm start --comparisonsDirectory=CompsSingleODS
GetArgValue = (argName) => {
    const arg = process.argv.find(value => value.includes(argName));
    return arg ? arg.split('=')[1] : "CompsSingleODS"; 
}

// Notify Application of Comparison Logic/SQL Set to use (This will identify folder with json)
// eg: CompsSingleODS, CompsSynergy
// Default - CompsSingleODS
const fldrJSONCompareDefns = GetArgValue("comparisonsDirectory");


// Load the manifest to know Src and Dest
let manifest = JSON.parse(fs.readFileSync(fldrJSONCompareDefns+'/manifest.json'));

var app = express();

// ::Web Server Endpoints::
// Serve the HTML page that will get the results.
// JW 7-6-2020: Addition to support public folder within project
app.use(express.static(__dirname+'/public'));

//Function to execute MsSQL queries.
ExecuteSql = (connectionString,query,params = null) => {
    return sql.connect(connectionString).then((connection) => {
        const dbRequest = new sql.Request();
        if(params){
            params.forEach(param => { 
                dbRequest.input(param.name, param.type, param.value);
            });
        }
        return dbRequest.query(query).then(sqlResult => {
            connection.close();
            const sqlResponse = sqlResult && sqlResult.recordsets[0];
            return sqlResponse;
        }).catch( (error) => {
            console.log(error);
            connection.close();
            return null;
        });
    }).catch((error) => {
        console.log(error);
        return null;
    }); 
}

// The api call that will execute the process and return JSON
app.get('/api/execute', async(req, res) => {
    
    let results = [];

    try {
        // make sure that any items are correctly URL encoded in the connection string
        let destPool = new sql.ConnectionPool(manifest.DestDb);
        let srcPool = new sql.ConnectionPool(manifest.SrcDb);

        let destConn = destPool.connect();
        let srcConn = srcPool.connect();

        // Execute Counts

        await destConn;
        await srcConn;
        
        for(let i=0; i<manifest.ComparisonsToRun.length; i++) {
            let compFile = manifest.ComparisonsToRun[i];
            // console.log(fldrJSONCompareDefns+`/Comparisons/${compFile}`);
            
            // TODO: let comparrisonMetadata = 
            let comp = JSON.parse(fs.readFileSync(`${fldrJSONCompareDefns}/Comparisons/${compFile}`));

            var diffModel = {};
            let sourceRows = [];
            let destinationRows = [] ;
            if(comp.DetailKeys) {
                
                const sourcePromise = ExecuteSql(manifest.DestDb,comp.DestSQLDetail);
                await sourcePromise.then(sqlRows => {
                    // Rows from soruce database
                    destinationRows = sqlRows;
                }).catch(error =>{
                    console.log(error);
                })

                const destinationPromise = ExecuteSql(manifest.SrcDb,comp.SrcSQLDetail);
                await destinationPromise.then(sqlRows => {
                    // Rows from destination database
                    sourceRows = sqlRows;
                }).catch(error =>{
                    console.log(error);
                })

                diffModel = compareObjectArrays(sourceRows,destinationRows,comp.DetailKeys);
            }

            var result = { 
                Comp:comp.Name, 
                Source: `${comp.CountName}:${sourceRows.length}`, 
                Destination:`${comp.CountName}:${destinationRows.length}`,
                AreEqual: diffModel.areEqual,
                DiffModel: diffModel
            };

            results.push(result); 
        }
            
    } catch (err) {
        // ... error checks
        console.log(err);
    }

    res.send(results);
});

function compareObjectArrays(arrA,arrB,uniqueKey)
{
    var model = {
        rowCountSame: arrA.length === arrB.length,
        diffs:[],
        existisInSrcButNotInDest:[],
        existisInDestButNotInSrc:arrB, // Addigning to remove the ones we find.
        areEqual : false
    };
    
    // Iterate over the src first.
    arrA.forEach( (elementA) => {
        // Assumption: the first col is the key.
        var aKeys = Object.keys(elementA);

        var bResultsArr = arrB.filter(b=> uniqueKey.every(k=> valueIsEqual(elementA, b, k)));
        // We found the element based on the key
        if(bResultsArr.length > 0) {
            var elementB = bResultsArr[0];
            // Are they equal?
            if(!objectsAreEqual(elementA,elementB))
                model.diffs.push({src:elementA, dest:elementB});
            // lets remove from the existisInDestButNotInSrc
            model.existisInDestButNotInSrc = model.existisInDestButNotInSrc.filter(e=> !uniqueKey.every(k=> valueIsEqual(e, elementB, k)));
        }
        else { // Row not in destination.
            model.existisInSrcButNotInDest.push(elementA);
        }
    });
    model.areEqual == model.diffs.length == 0 && model.existisInSrcButNotInDest.length == 0 && model.existisInDestButNotInSrc.length == 0;
    return model;
}

function valueIsEqual(objA, objB, key)
{
    return objA[key]===objB[key];
}

function objectsAreEqual(a,b)
{
    return JSON.stringify(a) === JSON.stringify(b);
}

function getScalar(recordsets){
    // For scalar values like counts you have to select the first recordset and then first object.
    var recordset = recordsets[0][0];
    var keys = Object.keys(recordset);
    return `${keys[0]}:${recordset[keys[0]]}`;
}

function evalScalarsAreEqual(sourceRows, destinationRows) {
    var src = sourceRows[0];
    var dest = destinationRows[0];
    if(src){
        var key = Object.keys(src)[0];
        return src[key]===dest[key];
    }
    return false;
}

var server = app.listen(5000, function () {
    console.log('Server is running.. @ http://localhost:5000/');
});
