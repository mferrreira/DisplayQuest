# Arquivos de som

Dois arquivos de áudio usados por `lib/notifications/alert-sound.ts`:

| Arquivo | Som | Evento |
| --- | --- | --- |
| `pausa.mp3` | Confirmation tone | pausa da sessão de trabalho, inclusive a automática |
| `notificacao.mp3` | Bubble pop up alert notification | notificação não lida chegando |

## Origem e licença

Os dois vêm do [Mixkit](https://mixkit.co/), sob a **Mixkit License**
(<https://mixkit.co/license/#sfxFree>), que permite uso livre, inclusive em projeto
comercial, sem exigir atribuição. Os links de origem, para conferir ou trocar o arquivo:

- `pausa.mp3`: <https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3>
- `notificacao.mp3`: <https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3>

Antes destes, os dois sons eram sintetizados em WebAudio dentro do próprio módulo. O dono
não gostou de nenhuma das versões sintetizadas (medido em 2026-10-09: volume baixo três
vezes, e um "plim" de oscilador que ele também recusou) e pediu som gravado de base livre.
