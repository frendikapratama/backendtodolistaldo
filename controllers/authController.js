import User from "../models/User.js";
import bcrypt from "bcrypt";
import crypto from "crypto"
import Session from "../models/Session.js";
import jwt from "jsonwebtoken";

const TOKEN_SECRET =
  process.env.TOKEN_SECRET ||
  "48db792b7ced19872b7109589afb94bb084acf4b5ef0879ccc5855395cb44a5e";

export async function login(req, res) {
  try {
    const { identifier, password } = req.body;


const user = await User.findOne({
  $or: [
    { email: identifier },
    { username: identifier },
  ],
});

    if (!user) return res.status(400).json({
        message: "Email or Username Not Found",
    }) 

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({
      message:"Wrong Password"
    })
    user.lastLogin = new Date()
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      TOKEN_SECRET,
      {
        expiresIn:"12h"
      }
    );
    const refreshToken = crypto.randomBytes(64).toString("hex")
    const hashedToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex")

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7)
    
    await Session.create({
      user: user._id,
      refreshToken: hashedToken,
      expiresAt
    })
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      // sameSite: "strict",
      expires: expiresAt,
      path: '/'
    })
    res.json({ message: "Login Successfully", accessToken: token });
    }catch (error) {
      res.status(500).json({message: error.message})
  }
}

export async function refresh(req, res) {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.sendStatus(401);

    const hashed = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const session = await Session.findOne({
      refreshToken: hashed,
      revoked: false
    });

    if (!session) return res.sendStatus(403);

    if (session.expiresAt < new Date()) {
      return res.sendStatus(403);
    }

    const token = jwt.sign(
      { id: session.user },
      process.env.TOKEN_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ accessToken: token });

  } catch (error) {
    res.sendStatus(500);
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.sendStatus(204);

    const hashed = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    await Session.findOneAndUpdate(
      { refreshToken: hashed },
      { revoked: true }
    );
    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return res.sendStatus(204);
  } catch (err) {
    return res.sendStatus(500);
  }
}

export function protect(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.sendStatus(401);
  }
}
