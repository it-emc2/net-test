import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Service from '../src/models/Service.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB || 'KonfiguratorDB';

const services = [
  { serviceId: 'V22WS1R', name: 'Wannenset individual 2.2 m. Wandhalter Schlauch u. HB 1-str. rund verchr. VIGOUR', price: 39.38  },
  { serviceId: 'TEMPDSU250', name: 'Duschsystem Tempesta Flex verchromt m. Umstellung KB 210mm Brausegarn. Grohe', price: 165.83  },
  { serviceId: 'V22BG903R', name: 'Brausegarnitur individ. 2.2 m. Stange 90cm Schlauch u. HB 3-str. rund verchr. VIGOUR', price: 66.55 }
  
];

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = services.map(p => ({
      updateOne: {
        filter: { serviceId: p.serviceId },
        update: { $set: { name: p.name, price: Number(p.price) } },
        upsert: true
      }
    }));
    const result = await Service.bulkWrite(ops);
    console.log('Seed result:', result);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();