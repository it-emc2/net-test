// Hausmeister-Service (step `hms`): the page of Winterdienst with its own heading, note placeholder
// and section (rules.ts; test/wd-hms.test.tsx replays today's recordings of both).
import { ServicePage } from "../wd/Winterdienst.js";

export function Hausmeister() {
  return <ServicePage type="hms" />;
}
