type ClientConfig = {
  name: string;
  domain: string;
  ga4_property_id: string;
};

const clients: Record<string, ClientConfig> = {
  skyhealth: {
    name: 'SkyHealth Media',
    domain: 'skyhealthmedia.com',
    ga4_property_id: '501364602',
  },
  kernplacepediatrics: {
    name: 'Kern Place Pediatrics',
    domain: 'kernplacepediatrics.com',
    ga4_property_id: '528543159',
  },
  pediatricgi: {
    name: 'Pediatric GI of El Paso',
    domain: 'elppedsgi.com',
    ga4_property_id: '528517254',
  },
  vipeds: {
    name: 'VIPeds Pediatric Hospital Medicine',
    domain: 'vipeds.org',
    ga4_property_id: '529057672',
  },
  drhector: {
    name: 'Dr Hector Rodriguez',
    domain: 'hrodriguezmd.com',
    ga4_property_id: '531375265',
  },
};

export default clients;