package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.ForecastResponse;
import hospital.Hospisync_backend.model.BedRecord;
import hospital.Hospisync_backend.model.ForecastResult;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.repository.BedRecordRepository;
import hospital.Hospisync_backend.repository.ForecastResultRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import hospital.Hospisync_backend.repository.PatientAdmissionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.Collections;

@Service
@RequiredArgsConstructor
@Slf4j
public class ForecastService {

    private final HospitalRepository hospitalRepository;
    private final PatientAdmissionRepository patientAdmissionRepository;
    private final BedCategoryService bedCategoryService;
    private final NotificationService notificationService;

    public ForecastResponse getForecast(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));

        // Fetch daily counts for the last 7 days
        List<Map<String, Object>> dailyCounts = patientAdmissionRepository.findDailyCountsLast7Days(hospitalId);

        // Map to DataPoints for historical graph (reversed to show chronological order)
        List<ForecastResponse.DataPoint> historicalData = dailyCounts.stream()
                .filter(m -> m.get("day") != null && m.get("patients") != null)
                .map(m -> ForecastResponse.DataPoint.builder()
                        .timestamp(m.get("day").toString())
                        .occupancy(((Number) m.get("patients")).intValue())
                        .build())
                .collect(Collectors.collectingAndThen(Collectors.toList(), list -> {
                    java.util.Collections.reverse(list);
                    return list;
                }));

        // Calculate 7-day moving average
        int count = 0;
        int sum = 0;
        for (Map<String, Object> day : dailyCounts) {
            sum += ((Number) day.get("patients")).intValue();
            count++;
        }

        int predictedPatients = (count > 0) ? sum / count : 0;

        double mae = 0.0;
        double rmse = 0.0;
        if (count > 0) {
            double sumError = 0;
            double sumSqError = 0;
            for (Map<String, Object> day : dailyCounts) {
                int actual = ((Number) day.get("patients")).intValue();
                double error = actual - predictedPatients;
                sumError += Math.abs(error);
                sumSqError += Math.pow(error, 2);
            }
            mae = sumError / count;
            rmse = Math.sqrt(sumSqError / count);
        }

        ForecastResponse response = ForecastResponse.builder()
                .hospitalId(hospitalId)
                .predictedPatients(predictedPatients)
                .method(count + "-day Moving Average")
                .dataPointsUsed(count)
                .historicalData(historicalData)
                .modelUsed("STATISTICAL_MA")
                .mae(Math.round(mae * 100.0) / 100.0)
                .rmse(Math.round(rmse * 100.0) / 100.0)
                .build();

        // Compatibility fields for existing UI if still used partially
        response.setForecast24h(predictedPatients);
        
        // Add Scarcity Alert Logic (Revised for next-day)
        checkAndSetScarcityAlert(hospital, response);

        return response;
    }

    private void checkAndSetScarcityAlert(Hospital hospital, ForecastResponse response) {
        int totalCapacity = bedCategoryService.getTotalBeds(hospital.getId());
        if (totalCapacity == 0) return;

        double predictedOccupancy = response.getPredictedPatients();
        double occupancyRate = (predictedOccupancy / totalCapacity) * 100;

        if (occupancyRate >= 90) {
            response.setScarcityAlert(true);
            response.setAlertMessage(String.format("CRITICAL: Predicted next-day occupancy reaches %.1f%%. Immediate action required!", occupancyRate));
            notificationService.createNotification(hospital, response.getAlertMessage(), "SCARCITY_WARNING");
        } else if (occupancyRate >= 75) {
            response.setScarcityAlert(true);
            response.setAlertMessage(String.format("WARNING: High next-day occupancy (%.1f%%) predicted.", occupancyRate));
        }
    }
}

