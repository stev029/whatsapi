// Description: This script initializes a WhatsApp client for development purposes.
import waServices from "./services/whatsappService.js";
import connectDB from "./models/index.js";

await connectDB();
waServices.createClient(
  "6851b6c53a48e27834492d2c",
  "6285695029080",
  null,
  true,
);
