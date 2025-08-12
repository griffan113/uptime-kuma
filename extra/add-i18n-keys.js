const fs = require("fs");
const path = require("path");

const langDir = path.join(__dirname, "../src/lang");
const newKeys = {
    "Lines to fetch": "Lines to fetch",
    "The number of log lines to fetch from the container on each check.": "The number of log lines to fetch from the container on each check."
};

fs.readdir(langDir, (err, files) => {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    files.forEach((file) => {
        if (file.endsWith(".json") && file !== "en.json") {
            const filePath = path.join(langDir, file);
            fs.readFile(filePath, "utf8", (err, data) => {
                if (err) {
                    console.error(`Could not read file ${file}.`, err);
                    return;
                }

                let json;
                try {
                    if (data.trim() === "" || data.trim() === "{}") {
                        json = {};
                    } else {
                        // A simple trick to avoid JSON parsing errors with trailing commas
                        const cleanData = data.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
                        json = JSON.parse(cleanData);
                    }
                } catch (e) {
                    console.warn(`Could not parse JSON from ${file}, starting with empty object. Error: ${e.message}`);
                    json = {};
                }

                // Add new keys
                Object.assign(json, newKeys);

                const sortedKeys = Object.keys(json).sort();
                const sortedJson = {};
                for (const key of sortedKeys) {
                    sortedJson[key] = json[key];
                }

                const newJsonData = JSON.stringify(sortedJson, null, 4);

                fs.writeFile(filePath, newJsonData, "utf8", (err) => {
                    if (err) {
                        console.error(`Could not write file ${file}.`, err);
                    } else {
                        console.log(`Successfully updated ${file}`);
                    }
                });
            });
        }
    });
});
