
import User from '../models/User.js';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"

const TOKEN_SECRET = process.env.TOKEN_SECRET || "48db792b7ced19872b7109589afb94bb084acf4b5ef0879ccc5855395cb44a5e"

export  async function login (req, res) {
  try {
    const {email,password} = req.body;

    const user = await User.findOne({email});

    if (!user) return res.status(400).json({
      message:'Email Not Found'
    }) 

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({
      message:"Wrong Password"
    })

    const token = jwt.sign(
      {id: user._id, role : user.role},
      TOKEN_SECRET
      // {
      //   expiresIn:"48h"
      // }  
    );

    res.json({message:"Login Successfully",token});
    }catch (error) {
      res.status(500).json({message: error.message})
  }
}
 
