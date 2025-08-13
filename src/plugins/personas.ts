import axios from "axios";

type Profile = {
  nickname: string;
  aboutMe: string;
  profileImageUrl: string;
};

export const fetchPersonasProfile = async (
  walletId: string
): Promise<Profile | undefined> => {
  try {
    const response = await axios.get(
      `${process.env.REACT_APP_PERSONAS_URL}/profiles/${walletId}`
    );
    return response.data.payload as Profile;
  } catch (err) {
    console.log("Cannot fetch profile");
  }
  return undefined;
};
