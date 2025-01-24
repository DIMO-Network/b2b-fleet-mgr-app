# b2b-fleet-mgr-app
Web App for managing onboarding and removing vehicles, and their status. Meant for B2B customers.

## notes
this will use LIWD, but this App is not tied to one Developer License.
This App can be used with any dev license, ideally I could have user pick on start,
what info is needed to persist for Dev License.

I'll need frontend token, not sure if will need backend token too. 

Current thought is just to use the native web login method, having issues getting LIWD react component to work.

Onboarding a VIN:
- add to compass iot
- decode
- mint (mint vehicle worker?)
- sacd permissions to dev license
- synthetic device? 
- user_devices db records?
I think the last two start to tie in to the Open Integrations concept, how can we make that generic....


Architecture:
SPA, javascript based web app, dev from vite/ node, build and deploy from go, same as admin.
any framework or just follow like what rob eisenberg did in his web component examples, keep it simple, vite native app

first experiment:
regular web app, with javascript to store clientid, get login to work



