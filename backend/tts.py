import os
import asyncio
import uuid
import requests
import edge_tts

class TTSEngine:
    def __init__(self):
        # We will store synthesized files in a temporary directory inside the workspace
        self.output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp_audio")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Keep track of local voice clone models if loaded
        self.xtts_model = None
        self.xtts_speaker_wav = None

    async def speak_edge(self, text: str, voice: str = "en-US-EmmaMultilingualNeural") -> str:
        """
        Synthesize speech using Microsoft Edge TTS (Free, high-quality, offline-capable, fast).
        """
        filename = f"tts_{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(self.output_dir, filename)
        
        # Clean text of sentiment tags (e.g., [HAPPY], [SAD]) before speaking
        import re
        clean_text = re.sub(r'\[[A-Z_]+\]', '', text).strip()
        if not clean_text:
            return ""
            
        communicate = edge_tts.Communicate(clean_text, voice)
        await communicate.save(filepath)
        return filepath

    def speak_elevenlabs(self, text: str, api_key: str, voice_id_or_sample: str) -> str:
        """
        Synthesize speech using ElevenLabs (API-based, high-fidelity voice cloning).
        voice_id_or_sample can be a Voice ID (pre-cloned) or a path to a wav sample to clone on-the-fly.
        """
        import re
        clean_text = re.sub(r'\[[A-Z_]+\]', '', text).strip()
        if not clean_text:
            return ""

        filename = f"tts_{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(self.output_dir, filename)
        
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json"
        }
        
        voice_id = voice_id_or_sample
        # Check if the voice_id_or_sample is a filepath (meaning we need to clone it first)
        if os.path.exists(voice_id_or_sample):
            # Clone voice on-the-fly (in production, we'd cache the voice_id)
            voice_id = self._clone_elevenlabs_voice(api_key, voice_id_or_sample)
            if not voice_id:
                raise Exception("Failed to clone voice on ElevenLabs")

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        data = {
            "text": clean_text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }
        
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(response.content)
            return filepath
        else:
            raise Exception(f"ElevenLabs TTS error: {response.text}")

    def _clone_elevenlabs_voice(self, api_key: str, sample_path: str) -> str:
        """
        Upload a sample wav file to ElevenLabs to clone it, returns the Voice ID.
        """
        url = "https://api.elevenlabs.io/v1/voices/add"
        headers = {"xi-api-key": api_key}
        
        files = {
            "files": (os.path.basename(sample_path), open(sample_path, "rb"), "audio/wav")
        }
        data = {
            "name": f"ClonedVoice_{uuid.uuid4().hex[:6]}",
            "description": "Auto-cloned voice from desktop assistant sample."
        }
        
        response = requests.post(url, headers=headers, data=data, files=files)
        if response.status_code == 200:
            return response.json().get("voice_id")
        return ""

    def speak_local_xtts(self, text: str, sample_wav_path: str) -> str:
        """
        Local offline voice cloning using Coqui XTTS-v2.
        Loads the model on demand if not already cached.
        """
        import re
        clean_text = re.sub(r'\[[A-Z_]+\]', '', text).strip()
        if not clean_text:
            return ""

        filename = f"tts_{uuid.uuid4().hex}.wav"
        filepath = os.path.join(self.output_dir, filename)
        
        try:
            # Dynamically import TTS to prevent erroring out if they don't have it installed
            from TTS.api import TTS
        except ImportError:
            raise ImportError(
                "Local voice cloning library 'TTS' is not installed. "
                "Please run 'pip install TTS' to use local voice cloning."
            )
            
        if self.xtts_model is None:
            # Load XTTS v2 model (requires GPU for acceptable speed)
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
            
        self.xtts_model.tts_to_file(
            text=clean_text,
            speaker_wav=sample_wav_path,
            language="en",
            file_path=filepath
        )
        return filepath

    async def speak_gpt_sovits(self, text: str, ref_audio_path: str, prompt_text: str = "Default prompt", prompt_lang: str = "en", text_lang: str = "en") -> str:
        """
        Uses a locally running GPT-SoVITS API (usually on port 9880) to synthesize voice.
        """
        import re
        import httpx
        clean_text = re.sub(r'\[[A-Z_]+\]', '', text).strip()
        if not clean_text:
            return ""

        filename = f"tts_{uuid.uuid4().hex}.wav"
        filepath = os.path.join(self.output_dir, filename)

        url = "http://127.0.0.1:9880/tts"
        payload = {
            "text": clean_text,
            "text_lang": text_lang,
            "ref_audio_path": os.path.abspath(ref_audio_path),
            "prompt_text": prompt_text,
            "prompt_lang": prompt_lang
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()

            with open(filepath, "wb") as f:
                f.write(response.content)

            return filepath
        except Exception as e:
            raise Exception(f"Failed to connect to GPT-SoVITS on port 9880: {e}")
