// Load required libraries
var express = require('express');
var path = require("path");
var fs = require('fs');
var sql = require("mssql");

// Notify Application of Comparison Logic/SQL Set to use (This will identify folder with json)
// Default - CompsSingleODS
var fldrJSONCompareDefns = "CompsSingleODS";	// eg: CompsSingleODS, CompsSynergy
// Command line arguments
for (let j = 0; j < process.argv.length; j++) {
    console.log(j + ' -> ' + (process.argv[j]));
	if ( j == 2 ) {
		// console.log('IF = 2');
		fldrJSONCompareDefns = process.argv[2];
	}
}
console.log(fldrJSONCompareDefns);

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
        console.log(manifest);
        for(let i=0; i<manifest.ComparisonsToRun.length; i++) {
            let compFile = manifest.ComparisonsToRun[i];
			// console.log(fldrJSONCompareDefns+`/Comparisons/${compFile}`);
            let comp = JSON.parse(fs.readFileSync(`${fldrJSONCompareDefns}/Comparisons/${compFile}`));

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

app.get('/api/test', async(req, res) => {
    
    // make sure that any items are correctly URL encoded in the connection string
    let destPool = new sql.ConnectionPool(manifest.DestDb);
    let destConn = destPool.connect();

    await destConn;

    const destRequest = destPool.request(); // or: new sql.Request(pool1)
    const destResult = await destRequest.query("SELECT StudentUSI, StudentUniqueId, FirstName FROM edfi.Student");
    console.log(destResult);
    
    res.send(destResult);
});

app.get('/api/testarrays', async(req, res) => {
    
    // Assumptions:
    //  -- The key for each row in the array is the first column

    // Requirements:
    // 1) If all are equal Awesome. Do nothing =)
    // 2) If different then save for UI to process
    // 3) Find the ones that are in the SRC but not in DEST
    // 4) Find the ones that are in the DEST but not in SRC

    var src = [
        {studentUSI:1, name:"John", other:"value"},
        {studentUSI:2, name:"Doug", other:"value"},
        {studentUSI:3, name:"Mary", other:"value"}]; //Exists only in src

    var dest = [
        {studentUSI:1, name:"John", other:"value"}, //Same
        {studentUSI:2, name:"Dougl", other:"value"}, // Different name
        {studentUSI:4, name:"Kris", other:"value"}]; // Exists only in dest

    // Prep response model
    var resultModel = compareObjectArrays(src,dest);
    
    res.send(resultModel);
});

function compareObjectArrays(arrA,arrB)
{
    var model = {
        rowCountSame: arrA.length === arrB.length,
        diffs:[],
        existisInSrcButNotInDest:[],
        existisInDestButNotInSrc:arrB, // Addigning to remove the ones we find.
    };
    
    // Iterate over the src first.
    arrA.forEach( (elementA) => {
        // Assumption: the first col is the key.
        // TODO: Implement multiple keys: Easy to do with more composite keys? Maybe? LOL
        var aKeys = Object.keys(elementA);

        var bResultsArr = arrB.filter(b=> b[Object.keys(b)[0]]===elementA[aKeys[0]]);
        // We found the element based on the key
        if(bResultsArr.length > 0) {
            var elementB = bResultsArr[0];
            // Are they equal?
            if(!objectsAreEqual(elementA,elementB))
                model.diffs.push({src:elementA, dest:elementB});
            // lets remove from the existisInDestButNotInSrc
            model.existisInDestButNotInSrc = model.existisInDestButNotInSrc.filter(e=>e[Object.keys(e)[0]]!==elementB[Object.keys(elementB)[0]]);
        }
        else { // Row not in destination.
            model.existisInSrcButNotInDest.push(elementA);
        }
    });

    return model;
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

function evalScalarsAreEqual(srcRecordsets, destRecordsets) {
    var src = srcRecordsets[0][0];
    var dest = destRecordsets[0][0];

    var key = Object.keys(src)[0];
    
    return (src[key]===dest[key]);
}

var server = app.listen(5000, function () {
    console.log('Server is running.. @ http://localhost:5000/');
});
