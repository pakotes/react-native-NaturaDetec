import 'dotenv/config';

export default {
  expo: {
    name: "NaturaDetect",
    slug: "NaturaDetect",
    orientation: "portrait",
    extra: {
      API_BASE_URL: process.env.API_BASE_URL,
    },
  },
};