"""
Змейка — классическая аркадная игра на Python + Pygame.

Управление:
    Стрелки / WASD  — движение змейки
    P               — пауза
    R               — рестарт после проигрыша
    ESC             — выход

Правила:
    Собирай красную еду, растёт хвост — очки увеличиваются.
    Столкновение со стеной или с собой — конец игры.
"""

import random
import sys

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

# Цвета (R, G, B)
BLACK = (15, 15, 20)
WHITE = (240, 240, 240)
GREEN_HEAD = (0, 200, 80)
GREEN_BODY = (0, 160, 60)
RED = (220, 50, 50)
GRAY = (90, 90, 100)
YELLOW = (240, 220, 60)

UP, DOWN, LEFT, RIGHT = (0, -1), (0, 1), (-1, 0), (1, 0)


class SnakeGame:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Змейка | Snake")
        self.clock = pygame.time.Clock()
        self.font_big = pygame.font.SysFont(None, 72)
        self.font = pygame.font.SysFont(None, 36)
        self.high_score = 0
        self.reset()

    # ---------- Логика ----------
    def reset(self):
        cx, cy = GRID_WIDTH // 2, GRID_HEIGHT // 2
        # Змейка: список координат [голова, ..., хвост]
        self.snake = [(cx, cy), (cx - 1, cy), (cx - 2, cy)]
        self.direction = RIGHT
        self.pending_direction = RIGHT
        self.score = 0
        self.fps = FPS_START
        self.game_over = False
        self.paused = False
        self.food = self._spawn_food()

    def _spawn_food(self):
        free = [
            (x, y)
            for x in range(GRID_WIDTH)
            for y in range(GRID_HEIGHT)
            if (x, y) not in self.snake
        ]
        return random.choice(free) if free else None

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

        # Столкновение с собой (хвост уйдёт с места, если еда не съедена)
        body = self.snake[:-1]
        if new_head in body:
            self._die()
            return

        self.snake.insert(0, new_head)

        if new_head == self.food:
            self.score += 1
            self.food = self._spawn_food()
            if self.food is None:  # заполнена вся клетка — победа
                self._die()
        else:
            self.snake.pop()

    def _die(self):
        self.game_over = True
        self.high_score = max(self.high_score, self.score)

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

    def draw(self):
        self.screen.fill(BLACK)

        # Еда
        if self.food:
            fx, fy = self.food
            center = (fx * CELL_SIZE + CELL_SIZE // 2,
                      fy * CELL_SIZE + CELL_SIZE // 2)
            pygame.draw.circle(self.screen, RED, center, CELL_SIZE // 2 - 2)

        # Змейка
        for i, cell in enumerate(self.snake):
            self.draw_cell(cell, GREEN_HEAD if i == 0 else GREEN_BODY)

        # Счёт
        score_text = self.font.render(f"Счёт: {self.score}", True, WHITE)
        self.screen.blit(score_text, (10, 8))
        best_text = self.font.render(f"Рекорд: {self.high_score}", True, GRAY)
        self.screen.blit(best_text, (SCREEN_WIDTH - best_text.get_width() - 10, 8))

        if self.paused and not self.game_over:
            self._overlay("ПАУЗА", "Нажми P, чтобы продолжить")

        if self.game_over:
            self._overlay(
                "ИГРА ОКОНЧЕНА",
                f"Счёт: {self.score}   R — заново, ESC — выход",
            )

        pygame.display.flip()

    def _overlay(self, title, subtitle):
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 170))
        self.screen.blit(overlay, (0, 0))

        t = self.font_big.render(title, True, YELLOW)
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
