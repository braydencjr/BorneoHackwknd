import { Request, Response } from "express";
import { verifyGoogleToken } from "../config/googleAuth";
import { pool } from "../db";

interface GooglePayload {
  email: string;
  sub: string;
  name?: string;
  picture?: string;
}

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Google token is required",
      });
    }

    // Verify Google token
    const payload = (await verifyGoogleToken(token)) as GooglePayload;

    const email = payload.email;
    const googleId = payload.sub;

    // Check if user already exists
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    let user;

    if (result.rows.length === 0) {
      // Create new user
      const newUser = await pool.query(
        `INSERT INTO users (email, google_id)
         VALUES ($1, $2)
         RETURNING *`,
        [email, googleId]
      );

      user = newUser.rows[0];
    } else {
      user = result.rows[0];

      // Auto-link Google account if user registered with email/password before
      if (!user.google_id) {
        await pool.query(
          "UPDATE users SET google_id=$1 WHERE email=$2",
          [googleId, email]
        );
      }
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
      },
    });

  } catch (error) {
    console.error("Google login error:", error);

    res.status(401).json({
      message: "Invalid Google token",
    });
  }
};