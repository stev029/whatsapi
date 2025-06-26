# WhatsApp API

This project provides a simple API for interacting with WhatsApp.

## Features

- Multi sessions
- Limit sessions ( *can be set on .env file* )
- Pairing with code
- QRCode
- Send media
- Send messages
- Receive messages (webhooks)
- Authentication (Login, Register, Logout)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/stev029/whatsapi.git
   ```

2. Navigate to the project directory:

   ```bash
   cd whatsapi
   ```

3. Install dependencies:
    - Backend

        ```bash
        cd backend
        npm install
        ```

    - Frontend

        ```bash
        cd frontend
        npm install
        ```

## Configuration

Copy a `.env.example` file in the root directory and edit the following environment variables

## Usage

### Starting the Server

To start the API server, run:

```bash
npm start
```

The server will typically run on `:3000` (backend) and `:5173` (frontend) (or the `PORT` you configured).

### API Authentication Endpoints

- **POST /api/auth/register**

    `Registers a new user.`

    Request Body:

    ```json
    {
        "username": "foo",
        "password": "bar"
    }
    ```

- **POST /api/auth/login**

    `Logs in a user.`

    Request Body:

    ```json
    {
        "username": "foo",
        "password": "bar"
    }

- **POST /api/auth/logout**

    `Logs out a user.`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

- **POST /api/auth/refresh-token**

    `Refreshes a JWT token.`

    Request Body:

    ```json
    {
        "refreshToken": "Your_Refresh_Token"
    }
    ```

### API Whatspp Endpoints

- **POST /whatsapp/start-session (Auth Required)**

    `Starts a new WhatsApp session.`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

    Request Body:

    ```json
    {
        "phoneNumber": "6281234567890",
        "usePairingCode": Boolean ( true | false )
    }
    ```

- **POST /whatsapp/set-webhook (Auth Required)**

    `Set webhook when have messages incoming`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

    Request Body

    ```json
    {
        "phoneNumber": "6281234567890",
        "webhookUrl": "https://your-webhook-url.com/messages"
    }
    ```

- **POST /whatsapp/send-media**

    `Sends a media to a specified recipient.`

    Request Header:

    `X-SECRET-TOKEN`: Your Secret Token Session

    Request Body:

    ```json
    {
        "targetNumber": "6281234567890",
        "caption": "This is a caption" (optional),
        "filePath": "https://example.com/image.jpg"
    }
    ```

- **POST /whatsapp/send-message**

  `Sends a message to a specified recipient.`

  Request Header:

  `X-SECRET-TOKEN`: Your Secret Token Session
  
  Request Body:

  ```json
  {
    "targetNumber": "6281234567890",
    "message": "Hello from API!"
  }
  ```

- **POST /whatsapp/delete-session (Auth Required)**

    `Deletes a WhatsApp session.`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

    Request Body:

    ```json
    {
        "phoneNumber": "6281234567890"
    }
    ```

- **POST /whatsapp/request-code (Auth Required)**

    `Request a pairing code or qrcode`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

    Request Body:

    ```json
    {
        "phoneNumber": "6281234567890",
        "usePairingCode": Boolean ( true | false )
    }
    ```

- **GET /whatsapp/status (Auth Required)**

    `Get status of sessions`

    Request Header:

    `Authorization`: `'Bearer Your_JWT_Token'`

## Technologies Used

1. Backend
    - Node.js
    - Express.js
    - SocketIO
    - Baileys WhatsApp API
    - MongoDB
    - JWT

2. Frontend
    - React/Vite
    - TailwindCSS
    - SocketIO
    - Axios

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
