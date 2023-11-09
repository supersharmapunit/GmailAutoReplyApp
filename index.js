const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');


const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const REPLIED_THREADS_PATH = path.join(process.cwd(), 'repliedThreads.json');


const YOUR_EMAIL = 'punitsharmadev25@gmail.com';
const LABEL_NAME = 'REPLIED';

async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Load or request authorization to call APIs.
 *
 * @return {Promise<google.auth.OAuth2>}
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * Check if an email from a sender has been replied to based on the sender's email.
 *
 * @param {string} senderEmail
 * @param {Array<string>} repliedEmails
 * @returns {boolean}
 */
async function isEmailReplied(senderEmail, repliedEmails, threadId, authClient) {
    // Check if the sender's email has been replied to.
    if (repliedEmails.includes(senderEmail)) {
        console.log(`Email from ${senderEmail} already replied. Skipping...`);
        return true;
    }

    // Check if the email is already labeled as 'REPLIED'.
    const isAlreadyReplied = await isThreadAlreadyReplied(threadId, authClient);
    if (isAlreadyReplied) {
        console.log(`Email from ${senderEmail} is already labeled as 'REPLIED'. Skipping...`);
        return true;
    }

    return false;
}

/**
 * Mark an email as replied by adding its sender's email to the repliedEmails list.
 *
 * @param {string} senderEmail
 * @param {Array<string>} repliedEmails
 */
function markEmailAsReplied(senderEmail, repliedEmails) {
    repliedEmails.push(senderEmail);
    // Write the updated list to the JSON file
    fs.writeFile(REPLIED_THREADS_PATH, JSON.stringify(repliedEmails, null, 2))
        .then(() => console.log('Replied emails updated.'));
}

/**
 * Process and reply to unread messages.
 *
 * @param {google.auth.OAuth2} authClient
 */
async function processUnreadMessages(authClient) {
    try {
        const gmail = google.gmail({ version: 'v1', auth: authClient });

        // Load replied emails from a JSON file.
        let repliedEmails = [];
        try {
            const repliedEmailsContent = await fs.readFile(REPLIED_THREADS_PATH);
            repliedEmails = JSON.parse(repliedEmailsContent);
        } catch (err) {
            // Handle file not found or invalid JSON.
            console.log('No replied emails found in the file.');
        }

        console.log('Fetching unread messages from the inbox...');

        const res = await gmail.users.threads.list({
            userId: 'me',
            q: 'in:inbox is:unread', // Fetch only unread threads in the inbox.
        });

        const threads = res.data.threads;
        if (threads == undefined || threads.length == 0) {
            console.log("Nothing in the inbox. Returning...");
            return;
        }

        for (const thread of threads) {
            const threadId = thread.id;

            // Check if the email has already been replied to.
            if (await isEmailReplied(threadId, repliedEmails, threadId, authClient)) {
                continue;
            }

            console.log(`Processing thread: ${threadId}`);

            const threadDetails = await gmail.users.threads.get({
                userId: 'me',
                id: threadId,
            });

            const messages = threadDetails.data.messages;

            // Ensure that there are messages in the thread before processing.
            if (messages && messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                const headers = lastMessage.payload.headers;
                const senderHeader = headers.find(header => header.name === 'From');

                if (senderHeader) {
                    const sender = senderHeader.value;

                    // Ensure the sender email is not your own.
                    if (sender !== YOUR_EMAIL) {
                        console.log(`Replying to email: ${sender}`);

                        const replyContent = `To: ${sender}\r\n` +
                            'Content-Type: text/plain; charset="UTF-8"\r\n' +
                            'MIME-Version: 1.0\r\n' +
                            'Subject: Re: Your Message\r\n' +
                            '\r\n' +
                            'Thanks for contacting.';

                        const raw = Buffer.from(replyContent).toString('base64');

                        // Send a reply to the sender.
                        await gmail.users.messages.send({
                            userId: 'me',
                            requestBody: {
                                raw: raw,
                            },
                        });

                        // Mark the email as replied.
                        markEmailAsReplied(threadId, repliedEmails);
                        console.log(`Email from ${sender} marked as replied.`);

                        // Check and create the REPLIED label if it doesn't exist.
                        await changeLabel(threadId, authClient);
                    }
                }
            }
        }

        // Save the updated replied emails list to the JSON file.
        await fs.writeFile(REPLIED_THREADS_PATH, JSON.stringify(repliedEmails, null, 2));
        console.log('Replied emails saved to the file.');
    } catch (error) {
        console.error('Error:', error);
    }
}

async function isThreadAlreadyReplied(threadId, authClient) {
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const threadDetails = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
    });

    const threadLabels = threadDetails.data.labels;

    // Check if the 'REPLIED' label is present in the thread labels.
    const isReplied = threadLabels && threadLabels.some(label => label.name === LABEL_NAME);

    if (isReplied) {
        console.log(`Thread ${threadId} is already labeled as 'REPLIED'.`);
    }

    return isReplied;
}




async function changeLabel(threadId, authClient) {
    const labelId = await createLabelIfNotExists(authClient);
    await modifyThreadLabel(threadId, labelId, authClient);
}

async function createLabelIfNotExists(authClient) {
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Check if the 'REPLIED' label already exists
    const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
    const labels = labelsResponse.data.labels;
    const repliedLabel = labels.find(label => label.name === LABEL_NAME);

    if (!repliedLabel) {
        // Create the 'REPLIED' label if it doesn't exist
        const createLabelResponse = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: LABEL_NAME,
                messageListVisibility: 'show',
                labelListVisibility: 'labelShow',
            },
        });

        console.log(`Label '${LABEL_NAME}' created.`);
        return createLabelResponse.data.id;
    }

    // Return the existing label ID
    return repliedLabel.id;
}

async function modifyThreadLabel(threadId, labelId, authClient) {
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Modify the label for the thread using the label ID
    await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
            removeLabelIds: ['UNREAD'],
            addLabelIds: [labelId],
        },
    });

    console.log(`Thread ${threadId} label updated.`);
}

async function delay() {
    const seconds = Math.floor(Math.random() * (120 - 75 + 1) + 75);
    console.log("running after: ", seconds, 'seconds');
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function scheduleTask(tasks) {

    while (true) {
        await tasks();
        await delay();
    }
}

async function main() {
    const authClient = await authorize();
    const tasks = async () => {
        console.log('--------------------------------------');
        console.log('Starting message processing...');
        await processUnreadMessages(authClient);
        console.log('Message processing completed.');
        console.log('--------------------------------------');
    };
    await scheduleTask(tasks);
}

main();