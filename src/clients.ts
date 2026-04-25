type ClientConfig = {
  name: string;
  domain: string;
  ga4_property_id: string;
  ig_account_id?: string;
  fb_page_id?: string;
  meta_access_token_env?: string; // env var name holding this client's Meta token (falls back to shared META_ACCESS_TOKEN)
  tiktok_username?: string;
};

const clients: Record<string, ClientConfig> = {
  skyhealth: {
    name: 'SkyHealth Media',
    domain: 'skyhealthmedia.com',
    ga4_property_id: '501364602',
    ig_account_id: '17841476107371059',
    fb_page_id: '758804137314076',
    tiktok_username: 'skyhealthmedia',
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
    ig_account_id: '17841447254780623',
    fb_page_id: '102465945290748',
    meta_access_token_env: 'META_ACCESS_TOKEN_PEDSGI',
    tiktok_username: 'elppedsgi',
  },
  vipeds: {
    name: 'VIPeds Pediatric Hospital Medicine',
    domain: 'vipeds.org',
    ga4_property_id: '529057672',
    ig_account_id: '17841477719020966',
    fb_page_id: '807387855797515',
    tiktok_username: 'vipedselpaso',
  },
  drhector: {
    name: 'Dr Hector Rodriguez',
    domain: 'hrodriguezmd.com',
    ga4_property_id: '531375265',
  },
};

export default clients;