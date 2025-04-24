import SftpClient from "ssh2-sftp-client";
import xml2js from "xml2js";
import { create } from "xmlbuilder2";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();
const sftp = new SftpClient();

async function downloadFiles() {
  try {
    await sftp.connect({
      host: process.env.FTP_HOST!,
      username: process.env.FTP_USER!,
      password: process.env.FTP_PASSWORD!,
      port: parseInt(process.env.FTP_PORT || "22", 10),
    });

    console.log("Connected to SFTP server.");

    const remoteDir = process.env.FTP_REMOTE_PATH!;
    const fileList = await sftp.list(remoteDir);
    const filesToDownload = fileList.filter((f) => f.type === "-");

    if (filesToDownload.length === 0) {
      console.log("No files to download.");
    } else {
      fs.mkdirSync("downloads", { recursive: true });

      for (const file of filesToDownload) {
        const localPath = path.join("downloads", file.name);
        const remotePath = path.posix.join(remoteDir, file.name);

        try {
          // Download
          await sftp.fastGet(remotePath, localPath);
          console.log(`Downloaded: ${file.name}`);

          // Delete
          await sftp.delete(remotePath);
          console.log(`Deleted from server: ${file.name}`);
        } catch (err) {
          console.error(`Error handling file ${file.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("SFTP error:", err);
  } finally {
    sftp.end();
  }
}

async function processFiles() {
  const downloadsDir = path.join("downloads");
  const parsedDir = path.join("parsed");
  const files = fs.readdirSync(downloadsDir);

  // Filter
  const xmlFiles = files.filter((file) => file.endsWith(".xml"));

  for (const file of xmlFiles) {
    const inputPath = path.join(downloadsDir, file);
    const outputPath = path.join(parsedDir, `transformed_${file}`);

    await parse(inputPath, outputPath);
    await deleteFile(inputPath);
  }
}

async function parse(inputPath: string, outputPath: string) {
  try {
    const xmlData = fs.readFileSync(inputPath, "utf-8");
    const parser = new xml2js.Parser({ explicitArray: true });
    const jsonData = await parser.parseStringPromise(xmlData);
    const newXml = buildXMLFromData(jsonData);

    fs.writeFileSync(outputPath, newXml);
    console.log(`Transformed XML saved to ${outputPath}`);
  } catch (err) {
    console.error("Error during transformation:", err);
  }
}

const buildXMLFromData = (data: any): string => {
  var generatedReference = uuid();
  const companies: Record<number, string> = {
    271565: "SE",
    222387: "KR",
  };
  const getCopmany = (companyId: number): string => {
    return companies[companyId] ?? "UNKNOWN";
  };

  const shipment = data.tisys.tour[0].shipments[0].shipment[0];
  const tour = data.tisys.tour[0];
  const loading = shipment.station.find((s: any) => s.$.type === "loading");
  const unloading = shipment.station.find((s: any) => s.$.type === "unloading");

  const xml = create({
    import: {
      ediprovider_id: {
        "@matchmode": 0,
        "#text": 20,
      },
      company_id: {
        "@matchmode": 0,
        "#text": 1,
      },
      transportbookings: {
        transportbooking: {
          edireference: {
            "#text": generatedReference,
          },
          reference: {
            "#text": generatedReference,
          },
          customer_id: {
            "@matchmode": 1,
            "#text": getCopmany(tour.company_id),
          },
          shipments: {
            shipment: {
              edireference: {
                "#text": generatedReference,
              },
              reference: {
                "#text": shipment.tour_id,
              },
              plangroup_id: {
                "@matchmode": 0,
                "#text": 1,
              },
              pickupaddress: {
                address_id: {
                  "@matchmode": 5,
                  "#text": loading.company_name,
                },
                name: {
                  "#text": loading.company_name,
                },
                date: {
                  "#text": loading.from_date,
                },
                datetill: {
                  "#text": loading.until_date,
                },
                time: {
                  "#text": loading.from_time,
                },
                timetill: {
                  "#text": loading.until_time,
                },
                address1: {
                  "#text": loading.address,
                },
                zipcode: {
                  "#text": loading.zip,
                },
                city_id: {
                  "@matchmode": 4,
                  "#text": loading.city,
                },
                country_id: {
                  "@matchmode": 4,
                  "#text": loading.country_id,
                },
              },
              deliveryaddress: {
                address_id: {
                  "@matchmode": 5,
                  "#text": unloading.company_name,
                },
                name: {
                  "#text": unloading.company_name,
                },
                date: {
                  "#text": unloading.from_date,
                },
                datetill: { "#text": unloading.until_date },
                time: {
                  "#text": unloading.from_time,
                },
                timetill: { "#text": unloading.until_time },
                address1: {
                  "#text": unloading.address,
                },
                zipcode: {
                  "#text": unloading.zip,
                },
                city_id: {
                  "@matchmode": 4,
                  "#text": unloading.city,
                },
                country_id: {
                  "@matchmode": 4,
                  "#text": unloading.country_id,
                },
              },
              cargo: {
                weight: {
                  "#text": shipment.weight,
                },
              },
            },
          },
        },
      },
    },
  }).end({ prettyPrint: true });
  return xml;
};

const deleteFile = async (filePath: string) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error(`❌ Failed to delete file ${filePath}:`, err);
  }
};

async function run() {
  try {
    console.log("Starting download...");
    await downloadFiles();
    console.log("Download completed.");

    console.log("Starting to process downloaded files...");
    await processFiles();
    console.log("Files processed successfully.");
  } catch (err) {
    console.error("An error occurred during the process:", err);
  }
}

run();
