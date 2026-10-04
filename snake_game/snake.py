"""
Змейка — классическая аркадная игра на Python + Pygame.

Управление:
    Стрелки / WASD  — движение змейки
    P               — пауза
    R               — рестарт после проигрыша
    M               — включить/выключить звук
    ESC             — выход

Правила:
    Собирай красную еду, растёт хвост — очки увеличиваются.
    Столкновение со стеной, с собой или с камнем — конец игры.
    Каждые 5 очков на поле появляется новый камень-препятствие.
    Рекорд сохраняется между запусками в highscore.txt.
"""

import random
import struct
import sys
import wave
from io import BytesIO
from pathlib import Path

import pygame

# ----- Настройки -----
CELL_SIZE = 20          # размер одной клетки в пикселях
GRID_WIDTH = 30         # клеток по горизонтали
GRID_HEIGHT = 24        # клеток по вертикали
SCREEN_WIDTH = CELL_SIZE * GRID_WIDTH
SCREEN_HEIGHT = CELL_SIZE * GRID_HEIGHT
FPS_START = 8           # начальная скорость (ходов в секунду)
FPS_MAX = 20            # максимальная скорость
SPEEDUP_EVERY = 5       # ускорение каждые N съеденных кусочков
OBSTACLE_EVERY = 5      # новое препятствие каждые N очков
START_OBSTACLES = 3     # камней на поле при старте
MAX_OBSTACLES = 15      # предельное число камней
SAMPLE_RATE = 22050     # частота звука, Гц

HIGHSCORE_FILE = Path(__file__).with_name("highscore.txt")

# Цвета (R, G, B)
BLACK = (15, 15, 20)
WHITE = (240, 240, 240)
GREEN_HEAD = (0, 200, 80)
GREEN_BODY = (0, 160, 60)
RED = (220, 50, 50)
GRAY = (90, 90, 100)
YELLOW = (240, 220, 60)
STONE = (120, 115, 110)
STONE_DARK = (80, 76, 72)

UP, DOWN, LEFT, RIGHT = (0, -1), (0, 1), (-1, 0), (1, 0)


def _tone(freq_hz, duration_s, volume=0.35, wave_shape="sine", fade=True):
    """Генерирует простой тон и возвращает pygame.mixer.Sound."""
    n = int(SAMPLE_RATE * duration_s)
    frames = bytearray()
    for i in range(n):
        t = i / SAMPLE_RATE
        if wave_shape == "square":
            val = 1.0 if (t * freq_hz) % 1.0 < 0.5 else -1.0
        else:
            import math
            val = math.sin(2 * math.pi * freq_hz * t)
        amp = volume
        if fade:  # огибающая, чтобы не было щелчков
            edge = max(1, n // 8)
            if i < edge:
                amp *= i / edge
            elif i > n - edge:
                amp *= (n - i) / edge
        sample = int(max(-1.0, min(1.0, val * amp)) * 32767)
        frames += struct.pack("<h", sample)
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(frames))
    buf.seek(0)
    return pygame.mixer.Sound(buf)


class SnakeGame:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Змейка | Snake")
        self.clock = pygame.time.Clock()
        self.font_big = pygame.font.SysFont(None, 72)
        self.font = pygame.font.SysFont(None, 36)
        self.high_score = self._load_high_score()
        self._init_audio()
        self.reset()

    # ---------- Звук ----------
    def _init_audio(self):
        """Синтезируем звуки «на лету» — внешние файлы не нужны."""
        self.sound_on = True
        try:
            pygame.mixer.init(frequency=SAMPLE_RATE, size=-16, channels=1)
            self.snd_eat = _tone(880, 0.08, volume=0.3)
            self.snd_die = _tone(180, 0.35, volume=0.35, wave_shape="square")
            self.snd_obstacle = _tone(330, 0.12, volume=0.25)
            self.snd_record = _tone(1320, 0.25, volume=0.3)
        except pygame.error:
            # Нет звукового устройства (headless) — играем без звука
            self.sound_on = False
            self.snd_eat = self.snd_die = None
            self.snd_obstacle = self.snd_record = None

    def _play(self, sound):
        if self.sound_on and sound is not None:
            sound.play()

    def _toggle_sound(self):
        if self.snd_eat is None:  # аудио недоступно
            return
        self.sound_on = not self.sound_on

    # ---------- Рекорд ----------
    @staticmethod
    def _load_high_score():
        try:
            text = HIGHSCORE_FILE.read_text(encoding="utf-8").strip()
            return int(text) if text else 0
        except (OSError, ValueError):
            return 0

    @staticmethod
    def _save_high_score(value):
        try:
            HIGHSCORE_FILE.write_text(str(int(value)), encoding="utf-8")
        except OSError:
            pass  # не удалось записать — не критично

    # ---------- Логика ----------
    def reset(self):
        cx, cy = GRID_WIDTH // 2, GRID_HEIGHT // 2
        # Змейка: список координат [голова, ..., хвост]
        self.snake = [(cx, cy), (cx - 1, cy), (cx - 2, cy)]
        self.direction = RIGHT
        self.pending_direction = RIGHT
        self.score = 0
        self.game_over = False
        self.paused = False
        self.new_record = False
        self.obstacles = set()
        self.food = None  # инициализируем до спавна, т.к. _free_cells() читает self.food
        self._spawn_obstacles(START_OBSTACLES)
        self.food = self._spawn_food()

    def _free_cells(self):
        occupied = set(self.snake) | self.obstacles
        if self.food:
            occupied.add(self.food)
        return [
            (x, y)
            for x in range(GRID_WIDTH)
            for y in range(GRID_HEIGHT)
            if (x, y) not in occupied
        ]

    def _spawn_food(self):
        free = self._free_cells()
        return random.choice(free) if free else None

    def _spawn_obstacles(self, count):
        """Добавляет камни на свободные клетки."""
        for _ in range(count):
            free = self._free_cells()
            if len(self.obstacles) >= MAX_OBSTACLES or not free:
                break
            self.obstacles.add(random.choice(free))

    def _current_fps(self):
        return min(FPS_MAX, FPS_START + self.score // SPEEDUP_EVERY)

    def step(self):
        """Один ход змейки."""
        if self.game_over or self.paused:
            return

        self.direction = self.pending_direction
        hx, hy = self.snake[0]
        dx, dy = self.direction
        new_head = (hx + dx, hy + dy)

        # Столкновение со стеной
        if not (0 <= new_head[0] < GRID_WIDTH and 0 <= new_head[1] < GRID_HEIGHT):
            self._die()
            return

        # Столкновение с препятствием
        if new_head in self.obstacles:
            self._die()
            return

        # Столкновение с собой (хвост уйдёт с места, если еда не съедена)
        body = self.snake[:-1]
        if new_head in body:
            self._die()
            return

        self.snake.insert(0, new_head)

        if new_head == self.food:
            self.score += 1
            self._play(self.snd_eat)
            self.food = self._spawn_food()
            if self.food is None:  # заполнена вся клетка — победа
                self._die()
                return
            # Каждые OBSTACLE_EVERY очков — новый камень
            if self.score % OBSTACLE_EVERY == 0:
                self._spawn_obstacles(1)
                self._play(self.snd_obstacle)
        else:
            self.snake.pop()

    def _die(self):
        self.game_over = True
        self._play(self.snd_die)
        if self.score > self.high_score:
            self.high_score = self.score
            self.new_record = True
            self._save_high_score(self.high_score)
            self._play(self.snd_record)

    def _change_direction(self, new_dir):
        """Нельзя развернуться на 180°."""
        dx, dy = new_dir
        cdx, cdy = self.direction
        if (dx, dy) != (-cdx, -cdy):
            self.pending_direction = new_dir

    # ---------- Отрисовка ----------
    def draw_cell(self, pos, color):
        x, y = pos
        rect = pygame.Rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        pygame.draw.rect(self.screen, color, rect, border_radius=4)

    def draw_obstacle(self, pos):
        x, y = pos
        px, py = x * CELL_SIZE, y * CELL_SIZE
        rect = pygame.Rect(px, py, CELL_SIZE, CELL_SIZE)
        pygame.draw.rect(self.screen, STONE, rect, border_radius=5)
        # «трещины» на камне
        pygame.draw.line(self.screen, STONE_DARK,
                         (px + 4, py + 6), (px + CELL_SIZE - 6, py + 9), 2)
        pygame.draw.line(self.screen, STONE_DARK,
                         (px + 6, py + CELL_SIZE - 5), (px + CELL_SIZE - 4, py + CELL_SIZE - 8), 2)

    def draw(self):
        self.screen.fill(BLACK)

        # Еда
        if self.food:
            fx, fy = self.food
            center = (fx * CELL_SIZE + CELL_SIZE // 2,
                      fy * CELL_SIZE + CELL_SIZE // 2)
            pygame.draw.circle(self.screen, RED, center, CELL_SIZE // 2 - 2)

        # Препятствия
        for cell in self.obstacles:
            self.draw_obstacle(cell)

        # Змейка
        for i, cell in enumerate(self.snake):
            self.draw_cell(cell, GREEN_HEAD if i == 0 else GREEN_BODY)

        # Счёт
        score_text = self.font.render(f"Счёт: {self.score}", True, WHITE)
        self.screen.blit(score_text, (10, 8))
        best_text = self.font.render(f"Рекорд: {self.high_score}", True, GRAY)
        self.screen.blit(best_text, (SCREEN_WIDTH - best_text.get_width() - 10, 8))
        snd_text = self.font.render("[M] звук: вкл" if self.sound_on else "[M] звук: выкл", True, GRAY)
        self.screen.blit(snd_text, (10, SCREEN_HEIGHT - snd_text.get_height() - 8))

        if self.paused and not self.game_over:
            self._overlay("ПАУЗА", "Нажми P, чтобы продолжить")

        if self.game_over:
            lines = f"Счёт: {self.score}   R — заново, ESC — выход"
            self._overlay(
                "НОВЫЙ РЕКОРД!" if self.new_record else "ИГРА ОКОНЧЕНА",
                lines,
                yellow=self.new_record,
            )

        pygame.display.flip()

    def _overlay(self, title, subtitle, yellow=False):
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 170))
        self.screen.blit(overlay, (0, 0))

        color = YELLOW if yellow else (240, 240, 240)
        t = self.font_big.render(title, True, color)
        s = self.font.render(subtitle, True, WHITE)
        cx = SCREEN_WIDTH // 2
        cy = SCREEN_HEIGHT // 2
        self.screen.blit(t, (cx - t.get_width() // 2, cy - t.get_height()))
        self.screen.blit(s, (cx - s.get_width() // 2, cy + 20))

    # ---------- Главный цикл ----------
    def handle_key(self, key):
        if key in (pygame.K_UP, pygame.K_w):
            self._change_direction(UP)
        elif key in (pygame.K_DOWN, pygame.K_s):
            self._change_direction(DOWN)
        elif key in (pygame.K_LEFT, pygame.K_a):
            self._change_direction(LEFT)
        elif key in (pygame.K_RIGHT, pygame.K_d):
            self._change_direction(RIGHT)
        elif key == pygame.K_p:
            if not self.game_over:
                self.paused = not self.paused
        elif key == pygame.K_m:
            self._toggle_sound()
        elif key == pygame.K_r:
            if self.game_over:
                self.reset()

    def run(self):
        accumulator = 0.0
        while True:
            dt = self.clock.tick(60) / 1000.0  # реальное время в секундах

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()
                    self.handle_key(event.key)

            # Шаг змейки с текущей скоростью
            interval = 1.0 / self._current_fps()
            accumulator += dt
            while accumulator >= interval:
                self.step()
                accumulator -= interval

            self.draw()


if __name__ == "__main__":
    SnakeGame().run()
