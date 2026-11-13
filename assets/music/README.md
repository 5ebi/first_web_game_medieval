# Music

Background music for the game. The tracks are licensed from **Epidemic Sound** by the
project owner for use in this game. They are **not** free to reuse: don't copy them
into other projects.

| File | Title | Artist | Length |
|---|---|---|---|
| `merry-on-the-moor.mp3` | Merry on the Moor | Bonnie Grace | 3:14 |
| `highland-hymn.mp3` | Highland Hymn | Bonnie Grace | 3:08 |
| `river-walk.mp3` | River Walk | Philip Ayers | 3:06 |
| `dawn-of-the-long-road.mp3` | Dawn of the Long Road | Dian Shuai | 2:37 |
| `winds-of-aetheria.mp3` | Winds of Aetheria | Dian Shuai | 2:40 |

Music from Epidemic Sound (www.epidemicsound.com).

## How the files were prepared

From the original Epidemic Sound downloads (48 kHz, ~260 kbps, mastered to 0 dBFS):

- trailing silence cut,
- static gain so every track sits at about -16 LUFS (all tracks got quieter, peaks now
  between -1.8 and -5 dBFS, so nothing clips after decoding),
- 3 s fade-in at the start and 3 s fade-out at the end,
- MP3, 128 kbps, 44.1 kHz stereo (plays everywhere, incl. iOS Safari).

```sh
ffmpeg -i ES_Track.mp3 -t <end_s> \
  -af "volume=<-16 - LUFS>dB,afade=t=in:st=0:d=3,afade=t=out:st=<end_s - 3>:d=3" \
  -c:a libmp3lame -b:a 128k -ar 44100 track.mp3
```
