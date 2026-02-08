import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { DeviceStatusHistory } from './entities/device-status-history.entity';

@Injectable()
export class DeviceUpdateEmitter {
  private readonly updates$ = new Subject<DeviceStatusHistory>();

  emitUpdate(history: DeviceStatusHistory): void {
    this.updates$.next(history);
  }

  onUpdate(): Observable<DeviceStatusHistory> {
    return this.updates$.asObservable();
  }
}
