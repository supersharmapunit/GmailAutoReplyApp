
# Gmail AutoReply App

## Overview

This Node.js script automates the process of replying to unread emails in your Gmail inbox using the Gmail API. It checks for new unread messages, replies to them, and labels them as 'REPLIED'. The script runs indefinitely, periodically checking for new messages.

## Tech Stack

-   **Node.js**: The script is written in JavaScript and runs on the Node.js runtime.
    
-   **Google API Libraries**: Utilizes the `googleapis` library to interact with the Gmail API for reading and sending emails.
    

## Setup

1.  Clone the repository:    

    `https://github.com/supersharmapunit/GmailAutoReplyApp.git`

 
    
2.  Install dependencies:
    
    `npm install` 
    
3.  Set up Google API credentials:
    
    -   Obtain the `credentials.json` file by following the [Google API Node.js Quickstart](https://developers.google.com/gmail/api/quickstart).
        
    -   Save the `credentials.json` file in the project directory.
        
4.  Run the script:
    `node autoresponder.js` 
    
    The script will authenticate your Google account, process unread emails, and reply to them.
    

## Configuration

-   **YOUR_EMAIL**: Set your Gmail email address as the value for `YOUR_EMAIL` in the script.
    
-   **LABEL_NAME**: Set the label name for replied emails (default is 'REPLIED').
    

## File Structure

-   **token.json**: Stores the authorization token after the initial authentication.
    
-   **credentials.json**: Google API credentials file.
    
-   **repliedThreads.json**: JSON file to keep track of replied emails.
    

## Important Notes

-   Ensure the script has the necessary permissions to access and modify your Gmail account.
    
-   The script runs indefinitely, checking for new messages at random intervals between 75 to 120 seconds.