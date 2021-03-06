// Load required libraries
var express = require('express');
var path = require("path");
var fs = require('fs');
var sql = require("mssql");

// Notify Application of Comparison Logic/SQL Set to use (This will identify folder with json)
// !!!! JW: Might replace with managed table of options
const fldrJSONCompareDefns = "CompsSingleODS";	// eg: CompsSingleODS, CompsSynergy


// Load the manifest to know Src and Dest
let manifest = JSON.parse(fs.readFileSync(fldrJSONCompareDefns+'/manifest.json'));

var app = express();

// ::Web Server Endpoints::
// Serve the HTML page that will get the results.
// JW 7-6-2020: Addition to support public folder within project
app.use(express.static(__dirname+'/public'));

// The api call that will execute the process and return JSON
app.get('/api/execute', async(req, res) => {
    
    let results = [];

    try {
        // make sure that any items are correctly URL encoded in the connection string
        let destPool = new sql.ConnectionPool(manifest.DestDb);
        let srcPool = new sql.ConnectionPool(manifest.SrcDb);

        let destConn = destPool.connect();
        let srcConn = srcPool.connect();

        await destConn;
        await srcConn;

        for(let i=0; i<manifest.ComparisonsToRun.length; i++) {
            let compFile = manifest.ComparisonsToRun[i];
            let comp = JSON.parse(fs.readFileSync(`Comps`+fldrJSONCompareDefns+`/Comparison/${compFile}`));

            //console.log(comp.SrcSQL);
            const srcRequest = srcPool.request(); // or: new sql.Request(pool1)
            const srcResult = await srcRequest.query(comp.SrcSQL);

            const destRequest = destPool.request(); // or: new sql.Request(pool1)
            const destResult = await destRequest.query(comp.DestSQL);

            //let tResult = await sqlSrc.query("SELECT StudentUSI, FirstName from edfi.Student");
            console.log(srcResult.recordsets);
            console.log(destResult.recordsets);

            var resu = { 
                Comp:comp.Name, 
                Source:getScalar(srcResult.recordsets), 
                Destination:getScalar(destResult.recordsets),
                AreEqual: evalScalarsAreEqual(srcResult.recordsets,destResult.recordsets)
            };

            results.push(resu); 
        }
            
    } catch (err) {
        // ... error checks
        console.log(err);
    }

    res.send(results);
});

function getScalar(recordsets){
    // For scalar values like counts you have to select the first recordset and then first object.
    var recordset = recordsets[0][0];
    var keys = Object.keys(recordset);
    return `${keys[0]}:${recordset[keys[0]]}`;
}

function evalScalarsAreEqual(srcRecordsets, destRecordsets) {
    var src = srcRecordsets[0][0];
    var dest = destRecordsets[0][0];

    var key = Object.keys(src)[0];
    
    return (src[key]===dest[key])?"true":"<span style='color:red;'>false</span>";
}

var server = app.listen(5000, function () {
    console.log('Server is running.. @ http://localhost:5000/');
});
