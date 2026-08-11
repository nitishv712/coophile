import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/auth/firebaseAdmin';

// I/L/O/0/1 removed so codes survive being read aloud over voice chat.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * POST /api/livekit/token
 *
 * Mints a LiveKit access token for a participant. Optionally creates the room
 * first (host flow). Returns `{ token, room }`.
 *
 * Body: `{ room?: string; identity: string; create?: boolean; system?: string }`
 *
 * - `create: true` → generate a room code, create the room (max 2), return token
 * - `create: false` + `room` → join an existing room, return token
 */
export async function POST(req: NextRequest) {
  // Minting tokens burns real LiveKit participant-minutes, so this needs a
  // session even though the token itself is scoped to a single room.
  return withUser(async () => {
    try {
      const body = await req.json();
      const identity: string = body.identity;

      if (!identity) {
        return NextResponse.json(
          { error: 'identity is required' },
          { status: 400 },
        );
      }

      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

      if (!apiKey || !apiSecret || !livekitUrl) {
        return NextResponse.json(
          { error: 'LiveKit server is not configured' },
          { status: 500 },
        );
      }

      let roomName: string;
      const wantCreate = Boolean(body.create);

      if (wantCreate) {
        // Host flow: create a room with a generated code.
        roomName = makeRoomCode();
        const system = typeof body.system === 'string' ? body.system : undefined;

        const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
        await roomService.createRoom({
          name: roomName,
          maxParticipants: 2,
          emptyTimeout: 10 * 60, // 10 minutes, matches the old signaling sweep
          metadata: system ? JSON.stringify({ system }) : undefined,
        });
      } else {
        // Join flow: use the room code provided.
        roomName = String(body.room ?? '').toUpperCase().trim();
        if (!roomName) {
          return NextResponse.json(
            { error: 'room is required when not creating' },
            { status: 400 },
          );
        }
      }

      const at = new AccessToken(apiKey, apiSecret, {
        identity,
        ttl: '15m',
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();

      return NextResponse.json({ token, room: roomName });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[livekit/token]', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
