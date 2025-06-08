import { effect } from '@reatom/core';
import { lockDelayAtom } from '../models/lock-delay.ts';
import { lockDelayTimerVisibleAtom } from '../game-logic.ts';
import { LOCK_DELAY_TIME } from '../constants.ts';

/**
 * Lock Delay Timer Widget
 * Создает DOM элемент и отображает визуальный прогресс lock delay таймера
 */
export class LockDelayTimerWidget {
    private container: HTMLDivElement | null = null;
    private bar: HTMLDivElement | null = null;
    private intervalId: number | null = null;

    constructor() {
        this.initializeEffect();
    }

    /**
     * Инициализирует эффект который отслеживает состояние lock delay
     */
    private initializeEffect(): void {
        effect(() => {
            const lockDelay = lockDelayAtom();
            const isVisible = lockDelayTimerVisibleAtom();

            if (lockDelay.active && isVisible) {
                this.show();
                this.startVisualUpdate();
            } else {
                this.stopVisualUpdate();
                this.hide();
            }
        });
    }

    /**
     * Создает и показывает виджет на экране
     */
    private show(): void {
        if (this.container) return; // Уже создан

        // Создаем контейнер
        this.container = document.createElement('div');
        this.container.className = 'lock-delay-timer';

        // Создаем лейбл
        const timerLabel = document.createElement('div');
        timerLabel.className = 'timer-label';
        timerLabel.textContent = 'LOCK DELAY';

        // Создаем контейнер для полоски
        const timerBarContainer = document.createElement('div');
        timerBarContainer.className = 'timer-bar-container';

        // Создаем полоску прогресса
        this.bar = document.createElement('div');
        this.bar.className = 'timer-bar';

        // Собираем структуру
        timerBarContainer.appendChild(this.bar);
        this.container.appendChild(timerLabel);
        this.container.appendChild(timerBarContainer);

        // Добавляем в DOM
        document.body.appendChild(this.container);
    }

    /**
     * Скрывает и удаляет виджет с экрана
     */
    private hide(): void {
        if (this.container) {
            document.body.removeChild(this.container);
            this.container = null;
            this.bar = null;
        }
    }

    /**
     * Запускает визуальное обновление прогресса таймера
     */
    private startVisualUpdate(): void {
        // Очищаем предыдущий интервал
        // if (this.intervalId) {
        //     clearTimeout(this.intervalId);
        // }

        const renderLoop = () => {
            const currentLockDelay = lockDelayAtom();
            if (!currentLockDelay.active || !this.bar) {
                // this.stopVisualUpdate();
                return;
            }

            // Вычисляем прогресс с учетом паузы
            let elapsed: number;
            if (currentLockDelay.paused) {
                // Таймер на паузе - используем время до паузы
                elapsed = currentLockDelay.pausedAt - currentLockDelay.startTime - currentLockDelay.totalPausedTime;
            } else {
                // Таймер активен - текущее время минус все паузы
                elapsed = performance.now() - currentLockDelay.startTime - currentLockDelay.totalPausedTime;
            }

            const progress = Math.min(elapsed / LOCK_DELAY_TIME * 100, 100);

            // Обновляем ширину полоски
            this.bar.style.width = `${progress}%`;

            // Обновляем цвет в зависимости от прогресса
            this.updateProgressColor(progress, currentLockDelay.paused);

            requestAnimationFrame(renderLoop);
        };

        requestAnimationFrame(renderLoop);
        // Запускаем интервал для обновления визуального прогресса
        // this.intervalId = setTimeout(renderLoop, 16); // Обновляем каждые 50мс для плавности
    }

    /**
     * Останавливает визуальное обновление прогресса
     */
    private stopVisualUpdate(): void {
        if (this.intervalId) {
            // clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Обновляет цвет полоски прогресса в зависимости от процента и состояния паузы
     */
    private updateProgressColor(progress: number, isPaused: boolean = false): void {
        if (!this.bar) return;

        // Удаляем все классы цветов
        this.bar.classList.remove('warning', 'critical', 'complete', 'paused');
        if (isPaused) {
            // Специальный стиль для паузы
            this.bar.classList.add('paused');
        } else {
            // Обычные цвета в зависимости от прогресса
            if (progress >= 99) {
                this.bar.classList.add('complete');
            } else if (progress >= 85) {
                this.bar.classList.add('critical');
            } else if (progress >= 50) {
                this.bar.classList.add('warning');
            }
        }
    }

    /**
     * Публичный метод для инициализации виджета
     */
    public initialize(): void {
        console.log('🔧 Lock delay timer widget initialized');
    }
}

// Экспортируем единственный экземпляр виджета
export const lockDelayTimerWidget = new LockDelayTimerWidget();
