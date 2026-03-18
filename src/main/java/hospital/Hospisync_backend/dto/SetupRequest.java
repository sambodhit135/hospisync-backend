package hospital.Hospisync_backend.dto;

import lombok.*;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SetupRequest {
    private Long hospitalId;
    private List<SetupItem> departments;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SetupItem {
        private String name;
        private Integer beds;
        private String icon;
    }
}
