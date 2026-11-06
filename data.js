/*
 * Portfolio content. Edit this file to change what the map shows.
 *
 * STOPS     – one entry per building, in route order ("Next stop" follows this order).
 *   id      – used in the URL (#birchwood) and to link the building on the map
 *   node    – [column, row] of the intersection the rider stops at (columns 0–4, rows 0–3)
 *   dir     – which corner of that intersection the building sits on ([±1, ±1])
 *   kind    – 'about' | 'projects' | 'skills' | 'contact'; omit for a normal job/education stop
 * PROJECTS  – cards shown at the Projects stop
 * SKILLS    – groups at the Skills stop ("strong" tags render dark)
 * EMAIL     – used on the Contact stop
 *
 * Building drawings live in app.js under "landmarks" and are keyed by stop id.
 */
window.PORTFOLIO = {
STOPS: [
  { id:'about', node:[1,1], dir:[-1,-1], color:'#e76f51', nav:'About me', sub:'Start here', group:'Start', kicker:'Home base',
    title:"Hi, I'm Tomas", kind:'about' },
  { id:'birchwood', node:[4,2], dir:[-1,-1], color:'#2a9d8f', nav:'Birchwood', sub:'May – Aug 2026', group:'Experience', kicker:'Experience · Latest',
    title:'Software Developer Co-op', org:'Birchwood', meta:'May 2026 – Aug 2026 · Winnipeg, MB',
    tags:['Laravel','PHP','MySQL','Amazon S3','Phinx','Sphinx'],
    bullets:[
      'Added rich text formatting and image attachments to a comments feature using Laravel (PHP), integrating Amazon S3 for image storage.',
      'Built a PHP API endpoint to track post-sale items owed to customers, with input validation and error handling.',
      'Integrated database migrations using Phinx and normalized a MySQL schema to refactor a billing feature, removing a 10-item cap and enabling unlimited line items per record.',
      'Built an email and in-app notifications feature to keep users informed of billing status changes in real time.',
      'Fixed a long-standing Sphinx indexing bug that made stock numbers containing hyphens (e.g. H-123) unsearchable, restoring full search accuracy across inventory.'
    ]},
  { id:'conquest', node:[3,1], dir:[1,-1], color:'#457b9d', nav:'Conquest Planning', sub:'Sep – Dec 2025', group:'Experience', kicker:'Experience',
    title:'Software Developer Co-op', org:'Conquest Planning', meta:'Sep 2025 – Dec 2025 · Winnipeg, MB',
    tags:['Angular','TypeScript','C#','.NET'],
    bullets:[
      'Developed and maintained full-stack features using Angular and C# (.NET).',
      'Added validation rules and data migrations to API models to prevent invalid data from entering the system.',
      'Introduced report creation timestamps to improve tracking and resolve inconsistencies in report dates.',
      'Built frontend logic to control whether users can share layouts with teams, brands, or both based on their permission levels, ensuring appropriate access control.'
    ]},
  { id:'priceline', node:[2,0], dir:[-1,1], color:'#7b5ea7', nav:'Priceline', sub:'Jan – Apr 2025', group:'Experience', kicker:'Experience',
    title:'Software Developer Co-op', org:'Priceline', meta:'Jan 2025 – Apr 2025 · Winnipeg, MB',
    tags:['Ruby on Rails','Ruby','Mongoid','MongoDB','Agile'],
    bullets:[
      'Developed backend features using Ruby on Rails and Mongoid in a collaborative Agile environment.',
      'Built a system to transmit payment data to external APIs, enabling integration with third-party services for processing payments.',
      'Implemented a feature to identify and filter out incomplete bookings from internal reports, preventing report failures and manual data patching.',
      'Added a credit card validation step in the booking process, catching invalid entries early and avoiding unnecessary processing.'
    ]},
  { id:'gada', node:[1,3], dir:[-1,-1], color:'#d4a017', nav:'GADA Lab', sub:'May – Aug 2024', group:'Experience', kicker:'Research',
    title:'CS Research Associate', org:'GADA Lab · University of Manitoba', meta:'May 2024 – Aug 2024 · Winnipeg, MB',
    tags:['Distributed algorithms','Theory','Research'],
    bullets:[
      'Designed a theoretical distributed algorithm for the mutual visibility problem, where abstract agents aim to reach a configuration in which all agents can see each other.',
      'Collaborated with lab members to evaluate algorithm performance and presented findings at a poster competition.'
    ]},
  { id:'education', node:[0,2], dir:[1,1], color:'#c0392b', nav:'University of Manitoba', sub:'B.CS Honours Co-op', group:'Education', kicker:'Education',
    title:'Bachelor of Computer Science', org:'University of Manitoba', meta:'Expected graduation Dec 2027 · Winnipeg, MB',
    tags:['Honours','Co-op'],
    bullets:[
      'Honours Co-op program: four work terms so far, three in industry and one in research.',
      'Co-op terms at Birchwood, Conquest Planning and Priceline, plus a research term at the GADA Lab.'
    ]},
  { id:'projects', node:[2,2], dir:[-1,-1], color:'#f4a261', nav:'Projects', sub:'Things I built', group:'More', kicker:'Workshop',
    title:'Projects', kind:'projects' },
  { id:'skills', node:[3,3], dir:[1,-1], color:'#2bb38a', nav:'Skills', sub:'Toolbox', group:'More', kicker:'Market',
    title:'Technical skills', kind:'skills' },
  { id:'contact', node:[4,0], dir:[-1,1], color:'#3d5a80', nav:'Contact', sub:'Say hello', group:'More', kicker:'Post office',
    title:"Let's talk", kind:'contact' },
],
PROJECTS: [
  { name:'Flight Booking App', meta:'Jan 2026 – Apr 2026', tags:['Java','Android Studio','SQLite'], bullets:[
    'Full-stack developer on a 4-person team, owning architecture and design decisions for a course project.',
    'Developed a booking system following SOLID principles, so users can book, update, and cancel flights.',
    'Built flight seat selection logic so users can view and select seats.'] },
  { name:'Olympics 2024 Analysis Program', meta:'Sep 2024 – Dec 2024', tags:['Java','MySQL'], bullets:[
    'Wrote SQL queries to analyze Olympic stats on athletes, countries, and coaches.',
    'Used prepared statements and input validation to mitigate SQL injection risks.'] },
  { name:'Chat Website', meta:'Sep 2024 – Dec 2024', tags:['Python','JavaScript','HTML','CSS'], bullets:[
    'Real-time messaging site with a RESTful Python web server, using sockets and multithreading to handle multiple clients.',
    'JavaScript client with polling to show live chat updates without a page refresh.',
    'Responsive HTML/CSS interface with cookie-based authentication for login.'] },
],
SKILLS: [
  { h:'Languages', strong:['TypeScript','Ruby','Java','Python','C#'], rest:['C++','C','HTML/CSS','JavaScript'] },
  { h:'Frameworks', strong:['Angular','.NET','Ruby on Rails','Laravel'], rest:[] },
  { h:'Databases', strong:['MongoDB','MySQL','SQLite'], rest:[] },
  { h:'Tools', strong:[], rest:['Git','Docker','Postman','Jira','Visual Studio','VS Code','IntelliJ','CLion','Phinx','Sphinx'] },
],
EMAIL: 'tomashagos7@gmail.com',
};
