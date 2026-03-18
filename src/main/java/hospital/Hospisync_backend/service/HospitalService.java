package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.DashboardResponse;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.dto.SetupRequest;
import hospital.Hospisync_backend.repository.BedCategoryRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import hospital.Hospisync_backend.dto.MapDataResponse;
import hospital.Hospisync_backend.model.BedCategory;
import hospital.Hospisync_backend.dto.HospitalDetailResponse;

@Service
@RequiredArgsConstructor
public class HospitalService {

    private final HospitalRepository hospitalRepository;
    private final BedCategoryRepository bedCategoryRepository;
    private final BedCategoryService bedCategoryService;

    private static final double EARTH_RADIUS_KM = 6371.0;

    public Hospital getHospital(Long id) {
        return hospitalRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
    }

    public HospitalDetailResponse getHospitalDetail(Long hospitalId, Long fromHospitalId) {
        Hospital hospital = getHospital(hospitalId);
        List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);

        // Auto-seed defaults if needed
        if (categories.isEmpty()) {
            bedCategoryService.seedDefaults(hospital);
            categories = bedCategoryService.getCategories(hospitalId);
        }

        int totalBeds = categories.stream().mapToInt(BedCategory::getTotalCapacity).sum();
        int occupiedBeds = categories.stream().mapToInt(BedCategory::getOccupiedBeds).sum();
        int availableBeds = Math.max(0, totalBeds - occupiedBeds);
        double occupancyRate = totalBeds > 0 ? (double) occupiedBeds / totalBeds * 100 : 0;
        String utilizationStatus = getUtilizationStatus(occupancyRate);

        List<HospitalDetailResponse.BedCategoryDetail> categoryDetails = categories.stream()
                .map(cat -> HospitalDetailResponse.BedCategoryDetail.builder()
                        .categoryName(cat.getCategoryName())
                        .icon(cat.getIcon())
                        .total(cat.getTotalCapacity())
                        .occupied(Math.min(cat.getOccupiedBeds(), cat.getTotalCapacity()))
                        .available(Math.max(0, cat.getTotalCapacity() - cat.getOccupiedBeds()))
                        .build())
                .collect(Collectors.toList());

        // Calculate distance if fromHospitalId is provided
        double distance = 0;
        String travelTime = "N/A";
        if (fromHospitalId != null && !fromHospitalId.equals(hospitalId)) {
            Hospital fromHospital = getHospital(fromHospitalId);
            distance = haversine(
                    fromHospital.getLatitude(), fromHospital.getLongitude(),
                    hospital.getLatitude(), hospital.getLongitude()
            );
            distance = Math.round(distance * 10.0) / 10.0;
            int travelMinutes = (int) Math.ceil(distance / 40.0 * 60);
            travelTime = travelMinutes < 60
                    ? travelMinutes + " min"
                    : (travelMinutes / 60) + "h " + (travelMinutes % 60) + " min";
        }

        return HospitalDetailResponse.builder()
                .id(hospital.getId())
                .hospitalName(hospital.getHospitalName())
                .address(hospital.getAddress())
                .distance(distance)
                .estimatedTravelTime(travelTime)
                .utilizationStatus(utilizationStatus)
                .occupancyRate(Math.round(occupancyRate * 100.0) / 100.0)
                .totalBeds(totalBeds)
                .occupiedBeds(occupiedBeds)
                .availableBeds(availableBeds)
                .categories(categoryDetails)
                .build();
    }

    public DashboardResponse getDashboard(Long hospitalId) {
        Hospital hospital = getHospital(hospitalId);
        List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);

        // Auto-seed defaults for existing hospitals that have no categories yet
        if (categories.isEmpty()) {
            bedCategoryService.seedDefaults(hospital);
            categories = bedCategoryService.getCategories(hospitalId);
        }

        int totalBeds = categories.stream().mapToInt(BedCategory::getTotalCapacity).sum();
        int occupiedBeds = categories.stream().mapToInt(BedCategory::getOccupiedBeds).sum();
        int availableBeds = Math.max(0, totalBeds - occupiedBeds);
        double occupancyRate = totalBeds > 0 ? (double) occupiedBeds / totalBeds * 100 : 0;
        String utilizationStatus = getUtilizationStatus(occupancyRate);

        List<DashboardResponse.BedCategoryInfo> categoryInfos = categories.stream()
                .map(cat -> DashboardResponse.BedCategoryInfo.builder()
                        .categoryId(cat.getCategoryId())
                        .name(cat.getCategoryName())
                        .icon(cat.getIcon())
                        .total(cat.getTotalCapacity())
                        .occupied(Math.min(cat.getOccupiedBeds(), cat.getTotalCapacity()))
                        .available(Math.max(0, cat.getTotalCapacity() - cat.getOccupiedBeds()))
                        .build())
                .collect(Collectors.toList());

        return DashboardResponse.builder()
                .id(hospital.getId())
                .hospitalName(hospital.getHospitalName())
                .totalBeds(totalBeds)
                .occupiedBeds(occupiedBeds)
                .availableBeds(availableBeds)
                .occupancyRate(Math.round(occupancyRate * 100.0) / 100.0)
                .utilizationStatus(utilizationStatus)
                .categories(categoryInfos)
                .lastUpdated(hospital.getLastUpdated())
                .lastUpdatedAgo(getTimeAgo(hospital.getLastUpdated()))
                .build();
    }

    public int getAvailableBeds(Hospital hospital) {
        return bedCategoryService.getAvailableBeds(hospital.getId());
    }

    public double getOccupancyRate(Hospital hospital) {
        return bedCategoryService.getOccupancyRate(hospital.getId());
    }

    public String getUtilizationStatus(double occupancyRate) {
        if (occupancyRate >= 85) return "OVERUTILIZED";
        if (occupancyRate >= 60) return "MODERATE";
        return "UNDERUTILIZED";
    }

    public int getAvailableBedsByCategory(Hospital hospital, String categoryKeyword) {
        return bedCategoryService.getAvailableBedsByCategory(hospital.getId(), categoryKeyword);
    }

    public int getTotalPossibleBeds(Hospital hospital) {
        return bedCategoryService.getTotalPossibleBeds(hospital.getId());
    }

    public int getTotalPossibleBedsByCategory(Hospital hospital, String categoryKeyword) {
        return bedCategoryService.getTotalPossibleBedsByCategory(hospital.getId(), categoryKeyword);
    }

    public List<MapDataResponse> getHospitalMapData() {
        return hospitalRepository.findAll().stream().map(h -> {
            double occupancy = getOccupancyRate(h);
            return MapDataResponse.builder()
                    .id(h.getId())
                    .hospitalName(h.getHospitalName())
                    .latitude(h.getLatitude())
                    .longitude(h.getLongitude())
                    .occupancyRate(Math.round(occupancy * 100.0) / 100.0)
                    .utilizationStatus(getUtilizationStatus(occupancy))
                    .build();
        }).collect(Collectors.toList());
    }

    @Transactional
    public void setupComplete(SetupRequest request) {
        Hospital hospital = getHospital(request.getHospitalId());

        // Clear any existing categories (just in case they exist due to partial setup or seeding)
        List<BedCategory> existing = bedCategoryRepository.findByHospitalIdOrderByCategoryIdAsc(hospital.getId());
        if (!existing.isEmpty()) {
            bedCategoryRepository.deleteAll(existing);
        }

        // Save departments
        if (request.getDepartments() != null) {
            for (SetupRequest.SetupItem item : request.getDepartments()) {
                BedCategory category = BedCategory.builder()
                        .hospital(hospital)
                        .categoryName(item.getName())
                        .icon(item.getIcon())
                        .totalCapacity(item.getBeds() != null ? item.getBeds() : 0)
                        .occupiedBeds(0)
                        .futureReservedBeds(0)
                        .build();
                bedCategoryRepository.save(category);
            }
        }

        hospital.setSetupCompleted(true);
        hospital.setLastUpdated(LocalDateTime.now());
        Hospital saved = hospitalRepository.save(hospital);
        System.out.println("DEBUG: Setup completed for hospital ID: " + saved.getId() + ", flag: " + saved.isSetupCompleted());
    }

    private String getTimeAgo(LocalDateTime dateTime) {
        if (dateTime == null) return "Never";
        Duration duration = Duration.between(dateTime, LocalDateTime.now());
        long hours = duration.toHours();
        long minutes = duration.toMinutes();
        if (hours > 24) return (hours / 24) + " days ago";
        if (hours > 0) return hours + " hours ago";
        if (minutes > 0) return minutes + " minutes ago";
        return "Just now";
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }
}

