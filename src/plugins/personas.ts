import axios from "axios";

export type Profile = {
  nickname: string;
  aboutMe: string;
  profileImageUrl: string;
  privateMode?: boolean;
};

export const fetchPersonasProfile = async (
  walletId: string
): Promise<Profile | undefined> => {
  try {
    const response = await axios.get(
      `${process.env.PERSONAS_URL}/profiles/${walletId}`
    );
    return response.data.payload as Profile;
  } catch (err) {
    console.log("Cannot fetch profile");
  }
  return undefined;
};
