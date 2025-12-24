# AB Jail

AB Jail is an open-source project that brings transparency to political fundraising through AI-powered analysis and real-time monitoring.

**Disclaimer:** This project does not represent the views, opinions, or positions of any contributor's employer. The views and opinions expressed in this project are solely those of the individual contributors and do not necessarily reflect the official policy or position of any organization they may be affiliated with.

## Contributing

All contributions are welcome! Anyone may edit the code directly to improve the AI classification accuracy, change language, add new features, or fix bugs.

To contribute, fork the repo, make your changes, and submit a PR. Looking for improvements to AI accuracy, new features, or bug fixes.

### Codebase Overview
- Frontend pages and components: src/app and src/components
- API endpoints: src/app/api
- Server-side logic (including AI): src/server
- Database schemas and migrations: sql/ and src/server/db

For specifics:
- To edit the AI classification prompt: src/server/ai/classify.ts
- To edit the sender extraction prompt: src/server/ai/sender.ts

### Evaluating Changes
After updating AI logic, run the app locally and use the /evaluation page to test accuracy on sample data.

For full dev setup and workflow, see dev-workflow.md.

Not affiliated with ActBlue. See the about page for legal details.
